// parse-demo: accept a client-side parsed CS2 demo, validate the payload,
// bucket players into our team vs rival by SteamID64, build a DemoData v2
// document, and insert `matches` + `player_stats`.
//
// The real .dem parsing runs in the browser via @deademx/cs2 (see
// src/workers/demoParser.worker.ts). This function is now a thin, boring
// writer — no simulation, no random data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Side = "CT" | "TERRORIST";
type EndReason =
  | "target_bombed" | "bomb_defused" | "ct_elimination" | "t_elimination"
  | "round_time_expired" | "target_saved";
type BuyType = "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol";
interface RawEconomySide {
  avg_equip: number;
  buy_type: BuyType;
}

interface RawKill {
  attacker: string; victim: string; assister: string | null;
  weapon: string; headshot: boolean; is_opening: boolean; tick: number;
}
interface RawRound {
  round_number: number;
  winner_side: Side;
  end_reason: string;
  is_pistol: boolean;
  economy?: { CT: RawEconomySide; TERRORIST: RawEconomySide };
  kills: RawKill[];
}
interface RawPlayer {
  steamid: string; userid: number; name: string;
  team_first_half: Side | null;
  kills: number; deaths: number; assists: number;
  hs_kills: number; damage: number;
  first_kills: number; first_deaths: number;
  kast?: number | null; rating?: number | null;
}
interface RawParsed {
  map: string;
  server_name: string;
  demo_version: string;
  total_rounds: number;
  score: { ct: number; t: number };
  rounds: RawRound[];
  players: RawPlayer[];
  duration_ticks: number;
}

const MAP_ALIAS: Record<string, string> = {
  de_mirage: "Mirage", de_inferno: "Inferno", de_nuke: "Nuke", de_anubis: "Anubis",
  de_ancient: "Ancient", de_dust2: "Dust2", de_vertigo: "Vertigo",
  de_overpass: "Overpass", de_train: "Train", de_cache: "Cache",
};
function normalizeMap(raw: string): string {
  const l = (raw ?? "").toLowerCase();
  if (MAP_ALIAS[l]) return MAP_ALIAS[l];
  const s = l.replace(/^(de|cs)_/, "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// SteamID conversion: team_members stores SteamID3 (account_id),
// parser emits SteamID64. Offset = 76561197960265728.
const STEAM_ID_OFFSET = 76561197960265728n;
function steamId64ToId3(sid64: string): string {
  try {
    return String(BigInt(sid64) - STEAM_ID_OFFSET);
  } catch { return sid64; }
}
function steamId3To64(sid3: string): string {
  try {
    return String(BigInt(sid3) + STEAM_ID_OFFSET);
  } catch { return sid3; }
}
function steamIdVariants(raw: string | null | undefined): Set<string> {
  const sid = String(raw ?? "").trim();
  if (!sid) return new Set();
  const out = new Set([sid]);
  if (/^7656119\d{10}$/.test(sid)) out.add(steamId64ToId3(sid));
  else if (/^\d+$/.test(sid)) out.add(steamId3To64(sid));
  return out;
}
function opposite(side: Side): Side {
  return side === "CT" ? "TERRORIST" : "CT";
}

// Coach filter — matches names like "COACH nahu3jt", "COACH Quero10"
const COACH_RE = /(^|\s|[\[\(\-_.])coach\b/i;
const KNOWN_COACH_STEAM_IDS = new Set([
  "76561199108435769",
  "76561198098107455",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: admins only.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    // Body: expect the client-parsed payload.
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "body inválido" }, 400);
    const {
      path,
      rival: rivalOverride,
      match_type: matchTypeOverride,
      map: mapOverride,
      parsed,
    } = body as {
      path?: string; rival?: string; match_type?: string; map?: string;
      parsed?: RawParsed;
    };

    if (!parsed || typeof parsed !== "object") {
      return json({ error: "falta 'parsed' — el cliente debe enviar el resultado del parser local" }, 400);
    }

    // ── Validate the parsed payload ───────────────────────────────────────
    console.log("[parse-demo] payload snapshot:", JSON.stringify({
      map: parsed?.map,
      players_count: Array.isArray(parsed?.players) ? parsed.players.length : "not-array",
      rounds_count: Array.isArray(parsed?.rounds) ? parsed.rounds.length : "not-array",
      score: parsed?.score,
      total_rounds: parsed?.total_rounds,
    }));
    const errs: string[] = [];
    if (!parsed.map || typeof parsed.map !== "string") errs.push("parsed.map ausente");
    if (!parsed.score || typeof parsed.score.ct !== "number" || typeof parsed.score.t !== "number") {
      errs.push("parsed.score debe tener ct y t numéricos");
    }
    if (!Array.isArray(parsed.rounds)) errs.push("parsed.rounds debe ser array");
    if (!Array.isArray(parsed.players)) errs.push("parsed.players debe ser array");
    if (errs.length > 0) {
      console.error("[parse-demo] validation failed:", errs);
      return json({ error: "payload inválido", details: errs }, 400);
    }
    if (parsed.players.length === 0) {
      console.warn("[parse-demo] payload has 0 players — inserting match without player_stats");
    }

    const matchType = (matchTypeOverride === "TRAINING" || matchTypeOverride === "OFFICIAL")
      ? matchTypeOverride : "OFFICIAL";
    const rival = (typeof rivalOverride === "string" && rivalOverride.trim())
      ? rivalOverride.trim() : "Sin definir";
    const map = (typeof mapOverride === "string" && mapOverride.trim())
      ? mapOverride.trim() : normalizeMap(parsed.map);

    const { data: settingsRow } = await admin
      .from("team_settings")
      .select("team_name")
      .limit(1)
      .maybeSingle();
    const teamName = (typeof settingsRow?.team_name === "string" && settingsRow.team_name.trim())
      ? settingsRow.team_name.trim()
      : "Tactical Chaos";

    // ── Fetch our roster and bucket players by SteamID ───────────────────
    const { data: teamRaw } = await admin
      .from("team_members")
      .select("user_id, steam_id, steam_tag, player_name, is_coach, steam_avatar_url")
    const allTeamMembers = teamRaw ?? [];
    const roster = allTeamMembers.filter((m: any) => m.steam_id && !m.is_coach);
    const coachSteamIds = new Set<string>(KNOWN_COACH_STEAM_IDS);
    for (const member of allTeamMembers.filter((m: any) => m.is_coach)) {
      for (const variant of steamIdVariants(member.steam_id)) coachSteamIds.add(variant);
    }
    // BUG 1 FIX: team_members stores SteamID3 (account_id), parser emits SteamID64.
    // Build a lookup from SteamID3 → roster entry.
    const rosterBySteamId = new Map<string, any>();
    for (const r of roster) {
      for (const variant of steamIdVariants(r.steam_id)) rosterBySteamId.set(variant, r);
    }

    // Filter out coaches from parsed players before bucketing.
    const isCoach = (p: RawPlayer) => {
      if (COACH_RE.test(p.name ?? "")) return true;
      const variants = steamIdVariants(String(p.steamid ?? ""));
      for (const variant of variants) if (coachSteamIds.has(variant)) return true;
      return false;
    };
    const nonCoachPlayers = parsed.players.filter((p) => !isCoach(p));

    // BUG 7 FIX: ALL non-coach players must appear. Those matching our roster
    // go to team1, everyone else goes to team2. Never discard a player.
    const team1Players: RawPlayer[] = [];
    const team2Players: RawPlayer[] = [];
    // Map SteamID64 → roster entry for matched players (for avatar/user_id lookup).
    const rosterMatchBySid64 = new Map<string, any>();
    for (const p of nonCoachPlayers) {
      const sid64 = String(p.steamid ?? "");
      const rosterEntry = [...steamIdVariants(sid64)].map((variant) => rosterBySteamId.get(variant)).find(Boolean);
      if (rosterEntry) {
        team1Players.push(p);
        rosterMatchBySid64.set(sid64, rosterEntry);
      } else {
        team2Players.push(p);
      }
    }

    console.log("[parse-demo] team bucketing:", JSON.stringify({
      total_parsed: parsed.players.length,
      coaches_filtered: parsed.players.length - nonCoachPlayers.length,
      team1: team1Players.map((p) => p.name),
      team2: team2Players.map((p) => p.name),
    }));

    // Determine each team's first-half side from the parser's signal.
    let team1FirstHalfSide: Side = "CT";
    const t1WithSide = team1Players.find((p) => p.team_first_half);
    if (t1WithSide?.team_first_half) team1FirstHalfSide = t1WithSide.team_first_half;
    const team2FirstHalfSide: Side = team1FirstHalfSide === "CT" ? "TERRORIST" : "CT";

    // The worker reads final CT/T score from CCSTeam.m_iScore. Assign it to
    // our roster by the side we occupy at the match end, not by summed rounds.
    const finalRoundTotal = parsed.score.ct + parsed.score.t;
    const team1FinalSide = finalRoundTotal > 12 ? opposite(team1FirstHalfSide) : team1FirstHalfSide;
    const scoreTeam1 = team1FinalSide === "CT" ? parsed.score.ct : parsed.score.t;
    const scoreTeam2 = team1FinalSide === "CT" ? parsed.score.t : parsed.score.ct;
    if (finalRoundTotal > 30) throw new Error("Invalid round count");
    if (finalRoundTotal < 13) throw new Error("Match too short");
    if (parsed.rounds.length > finalRoundTotal) {
      parsed.rounds = parsed.rounds.filter((r) => r.round_number <= finalRoundTotal);
    }

    const totalRounds = finalRoundTotal;

    // ── Build DemoData v2 ────────────────────────────────────────────────
    const teamByPid = new Map<string, "team1" | "team2">();
    for (const p of team1Players) teamByPid.set(String(p.steamid), "team1");
    for (const p of team2Players) teamByPid.set(String(p.steamid), "team2");

    const sideForTeamRound = (team: "team1" | "team2", roundNumber: number): Side => {
      const firstHalfSide = team === "team1" ? team1FirstHalfSide : team2FirstHalfSide;
      return roundNumber <= 12 ? firstHalfSide : opposite(firstHalfSide);
    };
    const emptyEconomy = (roundNumber: number): { avg_equip: number; avg_balance: number; buy_type: BuyType } => ({
      avg_equip: roundNumber === 1 || roundNumber === 13 ? 800 : 0,
      avg_balance: 0,
      buy_type: roundNumber === 1 || roundNumber === 13 ? "pistol" : "full_eco",
    });

    const rounds = parsed.rounds.map((r) => {
      const team1Side = sideForTeamRound("team1", r.round_number);
      const team2Side = sideForTeamRound("team2", r.round_number);
      const team1Economy = r.economy?.[team1Side];
      const team2Economy = r.economy?.[team2Side];
      const economy = {
        team1: team1Economy
          ? { avg_equip: team1Economy.avg_equip, avg_balance: 0, buy_type: team1Economy.buy_type }
          : emptyEconomy(r.round_number),
        team2: team2Economy
          ? { avg_equip: team2Economy.avg_equip, avg_balance: 0, buy_type: team2Economy.buy_type }
          : emptyEconomy(r.round_number),
      };
      return ({
      round_number: r.round_number,
      is_pistol: r.is_pistol,
      winner_side: r.winner_side,
      end_reason: (r.end_reason ?? "ct_elimination") as EndReason,
      clutch: null,
      bomb: null,
      buy_types: { team1: economy.team1.buy_type, team2: economy.team2.buy_type },
      kills: r.kills.map((k) => ({
        attacker: k.attacker, victim: k.victim, assister: k.assister,
        weapon: k.weapon, headshot: k.headshot, wallbang: false,
        distance: 0, is_opening: k.is_opening, tick: k.tick,
      })),
      economy,
    });
    });

    // ADR = damage / total_rounds. KAST and rating come from the worker.
    const players: Record<string, unknown> = {};
    for (const p of nonCoachPlayers) {
      const sid = String(p.steamid);
      const team = teamByPid.get(sid) ?? "team2";
      const rosterEntry = rosterMatchBySid64.get(sid);
      const totalRoundsForRates = totalRounds || 1;
      const adr = +(p.damage / totalRoundsForRates).toFixed(1);
      players[sid] = {
        steamid: sid,
        name: p.name,
        team,
        role_deduced: null,
        avatar_url: rosterEntry?.steam_avatar_url ?? null,
        stats: {
          kills: p.kills, deaths: p.deaths, assists: p.assists,
          hs_kills: p.hs_kills, damage: p.damage,
          adr,
          kast: p.kast ?? null,
          rating: p.rating ?? null,
          first_kills: p.first_kills, first_deaths: p.first_deaths,
          clutches_won: 0, clutches_total: 0,
          utility_damage: 0, enemies_flashed: 0, mvps: 0,
        },
        per_round: [],
      };
    }

    const makeEmptyBuyStats = () => ({ full_eco: { wins: 0, losses: 0 }, eco: { wins: 0, losses: 0 }, half_buy: { wins: 0, losses: 0 }, full_buy: { wins: 0, losses: 0 }, pistol: { wins: 0, losses: 0 } });
    const buyTypeSummary = { team1: makeEmptyBuyStats(), team2: makeEmptyBuyStats() };
    for (const r of rounds) {
      const winnerTeam = r.winner_side === sideForTeamRound("team1", r.round_number) ? "team1" : "team2";
      for (const team of ["team1", "team2"] as const) {
        const buyType = r.buy_types[team];
        if (winnerTeam === team) buyTypeSummary[team][buyType].wins += 1;
        else buyTypeSummary[team][buyType].losses += 1;
      }
    }
    const demoData = {
      schema_version: 2,
      match: {
        map,
        server: parsed.server_name ?? "",
        date: new Date().toISOString(),
        match_type: matchType,
        total_rounds: totalRounds,
        score: { team1: scoreTeam1, team2: scoreTeam2 },
        teams: {
          team1: { name: teamName, first_half_side: team1FirstHalfSide, player_steamids: team1Players.map((p) => String(p.steamid)) },
          team2: { name: rival, first_half_side: team2FirstHalfSide, player_steamids: team2Players.map((p) => String(p.steamid)) },
        },
      },
      rounds,
      players,
      buy_type_summary: buyTypeSummary,
    };

    // ── Insert match row ─────────────────────────────────────────────────
    const { data: matchRow, error: matchErr } = await admin
      .from("matches")
      .insert({
        date: new Date().toISOString(),
        type: matchType,
        map,
        rival,
        score_us: scoreTeam1,
        score_them: scoreTeam2,
        starting_side: team1FirstHalfSide === "CT" ? "CT" : "TR",
        ct_pistol: "WIN", ct_second_round: "WIN", ct_setup: "WIN", ct_finalizacion: "WIN",
        tr_pistol: "WIN", tr_second_round: "WIN", tr_setup: "WIN", tr_finalizacion: "WIN",
        notes: `Importado desde demo: ${path ?? "(sin path)"}`,
        recorded_by: "demo-import",
      })
      .select("id").single();
    if (matchErr) return json({ error: "matches insert: " + matchErr.message }, 500);

    // ── player_stats inserts (our team, matched by SteamID) ─────────────
    const report: Array<Record<string, unknown>> = [];
    for (const p of team1Players) {
      const sid64 = String(p.steamid);
      const rosterEntry = rosterMatchBySid64.get(sid64);
      const hsPct = p.kills > 0 ? +(p.hs_kills / p.kills * 100).toFixed(1) : 0;
      const totalRoundsForRates = totalRounds || 1;
      const adr = +(p.damage / totalRoundsForRates).toFixed(1);
      await admin.from("player_stats").insert({
        match_id: matchRow.id,
        user_id: rosterEntry?.user_id ?? null,
        steam_id: sid64,
        steam_tag: p.name,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr,
        hs_pct: hsPct,
        kast_pct: p.kast ?? null,
        kr: +(p.kills / totalRoundsForRates).toFixed(2),
        dr: +(p.deaths / totalRoundsForRates).toFixed(2),
        fk: p.first_kills, fd: p.first_deaths,
        flash_assists: 0,
        util_dmg: 0,
        rating: p.rating ?? null,
      });
      report.push({
        steam_id: sid64, steam_tag: p.name,
        matched_user_id: rosterEntry?.user_id ?? null,
        matched_player_name: rosterEntry?.player_name ?? null,
        match_type: rosterEntry ? "steam_id" : "unmatched",
        avatar_url: rosterEntry?.steam_avatar_url ?? null,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr, hs_pct: hsPct, kast_pct: p.kast ?? null, rating: p.rating ?? null,
      });
    }
    // Also include team2 players in the report so the UI shows all players.
    for (const p of team2Players) {
      const sid64 = String(p.steamid);
      const totalRoundsForRates = totalRounds || 1;
      const hsPct = p.kills > 0 ? +(p.hs_kills / p.kills * 100).toFixed(1) : 0;
      const adr = +(p.damage / totalRoundsForRates).toFixed(1);
      report.push({
        steam_id: sid64, steam_tag: p.name,
        matched_user_id: null,
        matched_player_name: null,
        match_type: "unmatched",
        avatar_url: null,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr, hs_pct: hsPct, kast_pct: p.kast ?? null, rating: p.rating ?? null,
      });
    }

    await admin.from("matches").update({ demo_data: demoData }).eq("id", matchRow.id);

    return json({
      status: "imported",
      simulated: false,
      match_id: matchRow.id,
      map, rival,
      score_us: scoreTeam1, score_them: scoreTeam2,
      starting_side: team1FirstHalfSide,
      total_rounds: totalRounds,
      players: report,
      summary: {
        total: report.length,
        by_steam_id: report.filter((r) => r.match_type === "steam_id").length,
        by_steam_tag: 0,
        unmatched: report.filter((r) => r.match_type === "unmatched").length,
      },
      demo_data: demoData,
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
