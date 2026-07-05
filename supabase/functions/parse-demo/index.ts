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

interface RawKill {
  attacker: string; victim: string; assister: string | null;
  weapon: string; headshot: boolean; is_opening: boolean; tick: number;
}
interface RawRound {
  round_number: number;
  winner_side: Side;
  end_reason: string;
  is_pistol: boolean;
  kills: RawKill[];
}
interface RawPlayer {
  steamid: string; userid: number; name: string;
  team_first_half: Side | null;
  kills: number; deaths: number; assists: number;
  hs_kills: number; damage: number;
  first_kills: number; first_deaths: number;
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
    const errs: string[] = [];
    if (!parsed.map || typeof parsed.map !== "string") errs.push("parsed.map ausente");
    if (!parsed.score || typeof parsed.score.ct !== "number" || typeof parsed.score.t !== "number") {
      errs.push("parsed.score debe tener ct y t numéricos");
    }
    if (!Array.isArray(parsed.rounds)) errs.push("parsed.rounds debe ser array");
    if (!Array.isArray(parsed.players) || parsed.players.length === 0) {
      errs.push("parsed.players debe tener al menos un jugador");
    }
    if (errs.length > 0) return json({ error: "payload inválido", details: errs }, 400);

    const matchType = (matchTypeOverride === "TRAINING" || matchTypeOverride === "OFFICIAL")
      ? matchTypeOverride : "OFFICIAL";
    const rival = (typeof rivalOverride === "string" && rivalOverride.trim())
      ? rivalOverride.trim() : "Sin definir";
    const map = (typeof mapOverride === "string" && mapOverride.trim())
      ? mapOverride.trim() : normalizeMap(parsed.map);

    // ── Fetch our roster and bucket players by SteamID ───────────────────
    const { data: teamRaw } = await admin
      .from("team_members")
      .select("user_id, steam_id, steam_tag, player_name, is_coach, steam_avatar_url")
      .eq("is_coach", false);
    const roster = (teamRaw ?? []).filter((m) => m.steam_id);
    const rosterBySteam = new Map(roster.map((r) => [String(r.steam_id), r]));

    // Assign each parsed player to team1 (ours) or team2 (rival) by SteamID.
    const team1Players: RawPlayer[] = [];
    const team2Players: RawPlayer[] = [];
    for (const p of parsed.players) {
      const sid = String(p.steamid ?? "");
      if (sid && rosterBySteam.has(sid)) team1Players.push(p);
      else team2Players.push(p);
    }

    // Determine each team's first-half side. Prefer the parser's own signal
    // (team_first_half), fall back to the majority side of team1 in round 1.
    let team1FirstHalfSide: Side = "CT";
    const t1WithSide = team1Players.find((p) => p.team_first_half);
    if (t1WithSide?.team_first_half) team1FirstHalfSide = t1WithSide.team_first_half;
    // team2 always plays the opposite side.
    const team2FirstHalfSide: Side = team1FirstHalfSide === "CT" ? "TERRORIST" : "CT";

    // Compute our score vs theirs from CT/T totals + which side we started on.
    // First half = rounds 1..12 → team on first-half side wins those rounds
    // when the CT/T column matches. To avoid needing round-by-round side
    // tracking, we approximate: score by summing rounds where winner_side ==
    // our current side (accounting for the mid-half swap).
    let scoreTeam1 = 0, scoreTeam2 = 0;
    for (const r of parsed.rounds) {
      const firstHalf = r.round_number <= 12;
      const teamThisRound: Side = firstHalf ? team1FirstHalfSide : (team1FirstHalfSide === "CT" ? "TERRORIST" : "CT");
      if (r.winner_side === teamThisRound) scoreTeam1 += 1;
      else scoreTeam2 += 1;
    }
    // If parsed.rounds was empty for some reason, fall back to CT/T tallies.
    if (parsed.rounds.length === 0) {
      scoreTeam1 = team1FirstHalfSide === "CT" ? parsed.score.ct : parsed.score.t;
      scoreTeam2 = team1FirstHalfSide === "CT" ? parsed.score.t : parsed.score.ct;
    }

    const totalRounds = parsed.rounds.length || (parsed.score.ct + parsed.score.t);

    // ── Build DemoData v2 (leave unknown fields as empty defaults) ───────
    const nameByPid = new Map(parsed.players.map((p) => [String(p.steamid), p.name]));
    const teamByPid = new Map<string, "team1" | "team2">();
    for (const p of team1Players) teamByPid.set(String(p.steamid), "team1");
    for (const p of team2Players) teamByPid.set(String(p.steamid), "team2");

    const rounds = parsed.rounds.map((r) => ({
      round_number: r.round_number,
      is_pistol: r.is_pistol,
      winner_side: r.winner_side,
      end_reason: (r.end_reason ?? "ct_elimination") as EndReason,
      clutch: null,
      bomb: null,
      buy_types: { team1: "full_buy", team2: "full_buy" },
      kills: r.kills.map((k) => ({
        attacker: k.attacker, victim: k.victim, assister: k.assister,
        weapon: k.weapon, headshot: k.headshot, wallbang: false,
        distance: 0, is_opening: k.is_opening, tick: k.tick,
      })),
      economy: {
        team1: { avg_equip: 0, avg_balance: 0, buy_type: "full_buy" },
        team2: { avg_equip: 0, avg_balance: 0, buy_type: "full_buy" },
      },
    }));

    const players: Record<string, unknown> = {};
    for (const p of parsed.players) {
      const sid = String(p.steamid);
      const team = teamByPid.get(sid) ?? "team2";
      const rosterEntry = rosterBySteam.get(sid);
      const totalRoundsForRates = totalRounds || 1;
      players[sid] = {
        steamid: sid,
        name: p.name,
        team,
        role_deduced: null,
        avatar_url: rosterEntry?.steam_avatar_url ?? null,
        stats: {
          kills: p.kills, deaths: p.deaths, assists: p.assists,
          hs_kills: p.hs_kills, damage: p.damage,
          adr: +(p.damage / totalRoundsForRates).toFixed(1),
          kast: 0, rating: 0,
          first_kills: p.first_kills, first_deaths: p.first_deaths,
          clutches_won: 0, clutches_total: 0,
          utility_damage: 0, enemies_flashed: 0, mvps: 0,
        },
        per_round: [],
      };
    }

    const emptyBuyStats = { full_eco: { wins: 0, losses: 0 }, eco: { wins: 0, losses: 0 }, half_buy: { wins: 0, losses: 0 }, full_buy: { wins: 0, losses: 0 }, pistol: { wins: 0, losses: 0 } };
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
          team1: { name: "Hambrientos", first_half_side: team1FirstHalfSide, player_steamids: team1Players.map((p) => String(p.steamid)) },
          team2: { name: rival, first_half_side: team2FirstHalfSide, player_steamids: team2Players.map((p) => String(p.steamid)) },
        },
      },
      rounds,
      players,
      buy_type_summary: { team1: emptyBuyStats, team2: emptyBuyStats },
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

    // ── player_stats inserts (only for our team, matched by SteamID) ─────
    const report: Array<Record<string, unknown>> = [];
    for (const p of team1Players) {
      const sid = String(p.steamid);
      const rosterEntry = rosterBySteam.get(sid);
      const hsPct = p.kills > 0 ? +(p.hs_kills / p.kills * 100).toFixed(1) : 0;
      const totalRoundsForRates = totalRounds || 1;
      await admin.from("player_stats").insert({
        match_id: matchRow.id,
        user_id: rosterEntry?.user_id ?? null,
        steam_id: sid,
        steam_tag: p.name,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr: +(p.damage / totalRoundsForRates).toFixed(1),
        hs_pct: hsPct,
        kast_pct: 0,
        kr: +(p.kills / totalRoundsForRates).toFixed(2),
        dr: +(p.deaths / totalRoundsForRates).toFixed(2),
        fk: p.first_kills, fd: p.first_deaths,
        flash_assists: 0,
        util_dmg: 0,
        rating: 0,
      });
      report.push({
        steam_id: sid, steam_tag: p.name,
        matched_user_id: rosterEntry?.user_id ?? null,
        matched_player_name: rosterEntry?.player_name ?? null,
        match_type: rosterEntry ? "steam_id" : "unmatched",
        avatar_url: rosterEntry?.steam_avatar_url ?? null,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr: +(p.damage / totalRoundsForRates).toFixed(1),
        hs_pct: hsPct, kast_pct: 0, rating: 0,
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
