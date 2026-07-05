import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SIMULATED parser v2: emits the exact demo_data schema v2 (see src/types/demo.ts).
// When the real WASM parser lands (Step 2), only generateDemoData() changes — the
// roster matching, DB writes and response shape stay the same.

const MAPS = ["Mirage", "Inferno", "Nuke", "Anubis", "Ancient", "Dust2", "Vertigo", "Overpass", "Train"];
const RIVAL_NAMES = ["Team Nova", "Ratones", "Gauchos", "LosPibes", "Puntería GC"];
const RIVAL_TAGS = [
  ["KING", "meka", "agustoN", "jonny", "Concepts"],
  ["hunter", "vito", "ninja", "cold", "sparks"],
  ["neo", "duke", "milo", "wraith", "vex"],
];
const AWP_WEAPONS = ["awp"];
const RIFLE_WEAPONS = ["ak47", "m4a1_silencer", "m4a1", "aug", "sg556"];
const PISTOL_WEAPONS = ["glock", "usp_silencer", "hkp2000", "deagle"];

type Side = "CT" | "TERRORIST";
type EndReason = "target_bombed" | "bomb_defused" | "ct_elimination" | "t_elimination" | "round_time_expired";
type BuyType = "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol";

const BUY_ORDER: BuyType[] = ["full_eco", "eco", "half_buy", "full_buy", "pistol"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { path, rival: rivalOverride, map: mapOverride, match_type: matchTypeOverride } = body ?? {};
    if (!path || typeof path !== "string") return json({ error: "path requerido" }, 400);

    const rng = seededRng(hashString(path));
    const fileSize = 0;

    const { data: teamRaw } = await admin
      .from("team_members")
      .select("user_id, steam_id, steam_tag, player_name, is_coach, steam_avatar_url")
      .eq("is_coach", false);
    const roster = (teamRaw ?? []).filter((m) => m.steam_id);

    const map = (typeof mapOverride === "string" && mapOverride.trim())
      ? mapOverride.trim()
      : MAPS[Math.floor(rng() * MAPS.length)];
    const matchType = (matchTypeOverride === "TRAINING" || matchTypeOverride === "OFFICIAL")
      ? matchTypeOverride : "OFFICIAL";

    const team1FirstHalfSide: Side = rng() > 0.5 ? "CT" : "TERRORIST";
    const team2FirstHalfSide: Side = team1FirstHalfSide === "CT" ? "TERRORIST" : "CT";
    const scoreTeam1 = 6 + Math.floor(rng() * 10);
    const scoreTeam2 = 6 + Math.floor(rng() * 10);
    const totalRounds = scoreTeam1 + scoreTeam2;

    const rival = (typeof rivalOverride === "string" && rivalOverride.trim())
      ? rivalOverride.trim() : "Sin definir";
    const rivalTags = RIVAL_TAGS[Math.floor(rng() * RIVAL_TAGS.length)];

    // Team rosters: our team = team1 (from DB), rival = team2 (synthetic steamids)
    const team1Members = roster.slice(0, 5);
    const team2Members = rivalTags.slice(0, 5).map((tag) => ({
      steam_id: `76561198${100000000 + Math.floor(rng() * 900000000)}`,
      steam_tag: tag,
      player_name: tag,
      user_id: null as string | null,
      steam_avatar_url: null as string | null,
    }));

    const demoData = generateDemoData({
      rng, map, matchType, totalRounds,
      scoreTeam1, scoreTeam2,
      team1: { name: "Hambrientos", members: team1Members, firstHalfSide: team1FirstHalfSide },
      team2: { name: rival, members: team2Members, firstHalfSide: team2FirstHalfSide },
      path,
    });

    // --- Insert match row ---
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
        notes: `Importado desde demo: ${path}`,
        recorded_by: "demo-import",
      })
      .select("id").single();
    if (matchErr) return json({ error: "matches insert: " + matchErr.message }, 500);

    // --- player_stats inserts (same shape as before — no consumers broken) ---
    const report: any[] = [];
    for (const member of team1Members) {
      const p = demoData.players[member.steam_id];
      if (!p) continue;
      let matched = roster.find((r) => r.steam_id === member.steam_id);
      let matchTypeStr: "steam_id" | "steam_tag" | "unmatched" = matched ? "steam_id" : "unmatched";
      if (!matched) {
        matched = roster.find((r) => (r.steam_tag ?? "").toLowerCase() === (member.steam_tag ?? "").toLowerCase());
        if (matched) matchTypeStr = "steam_tag";
      }
      await admin.from("player_stats").insert({
        match_id: matchRow.id,
        user_id: matched?.user_id ?? null,
        steam_id: member.steam_id,
        steam_tag: member.steam_tag,
        kills: p.stats.kills, deaths: p.stats.deaths, assists: p.stats.assists,
        adr: p.stats.adr, hs_pct: p.stats.kills > 0 ? +(p.stats.hs_kills / p.stats.kills * 100).toFixed(1) : 0,
        kast_pct: p.stats.kast,
        kr: +(p.stats.kills / totalRounds).toFixed(2),
        dr: +(p.stats.deaths / totalRounds).toFixed(2),
        fk: p.stats.first_kills, fd: p.stats.first_deaths,
        flash_assists: p.stats.enemies_flashed,
        util_dmg: p.stats.utility_damage,
        rating: p.stats.rating,
      });
      report.push({
        steam_id: member.steam_id, steam_tag: member.steam_tag,
        matched_user_id: matched?.user_id ?? null,
        matched_player_name: matched?.player_name ?? null,
        match_type: matchTypeStr,
        avatar_url: matched?.steam_avatar_url ?? null,
        kills: p.stats.kills, deaths: p.stats.deaths, assists: p.stats.assists,
        adr: p.stats.adr, hs_pct: p.stats.hs_kills, kast_pct: p.stats.kast, rating: p.stats.rating,
      });
    }

    // Attach avatars into players dict for team1
    for (const m of team1Members) {
      const p = demoData.players[m.steam_id];
      if (p) (p as any).avatar_url = m.steam_avatar_url ?? null;
    }

    await admin.from("matches").update({ demo_data: demoData }).eq("id", matchRow.id);

    return json({
      status: "imported",
      simulated: true,
      match_id: matchRow.id,
      file_size: fileSize,
      map, rival,
      score_us: scoreTeam1, score_them: scoreTeam2,
      starting_side: team1FirstHalfSide,
      total_rounds: totalRounds,
      players: report,
      summary: {
        total: report.length,
        by_steam_id: report.filter((r) => r.match_type === "steam_id").length,
        by_steam_tag: report.filter((r) => r.match_type === "steam_tag").length,
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

// ============================================================================
// Simulator core → schema v2
// ============================================================================
interface TeamInput {
  name: string;
  members: Array<{ steam_id: string; steam_tag: string; player_name?: string | null }>;
  firstHalfSide: Side;
}

function generateDemoData(opts: {
  rng: () => number;
  map: string;
  matchType: "OFFICIAL" | "TRAINING";
  totalRounds: number;
  scoreTeam1: number;
  scoreTeam2: number;
  team1: TeamInput;
  team2: TeamInput;
  path: string;
}) {
  const { rng, map, matchType, totalRounds, scoreTeam1, scoreTeam2, team1, team2, path } = opts;

  // Winner sequence
  const winners: ("team1" | "team2")[] = [];
  for (let i = 0; i < scoreTeam1; i++) winners.push("team1");
  for (let i = 0; i < scoreTeam2; i++) winners.push("team2");
  for (let i = winners.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [winners[i], winners[j]] = [winners[j], winners[i]];
  }

  const rounds: any[] = [];
  const playerAgg: Record<string, PlayerAgg> = {};
  const initAgg = (sid: string, name: string, team: "team1" | "team2") => {
    if (!playerAgg[sid]) {
      playerAgg[sid] = {
        sid, name, team,
        kills: 0, deaths: 0, assists: 0, hs_kills: 0, damage: 0,
        rounds_with_kast: 0, first_kills: 0, first_deaths: 0,
        clutches_won: 0, clutches_total: 0,
        utility_damage: 0, enemies_flashed: 0, mvps: 0,
        awp_kills: 0, pistol_kills: 0,
        per_round: [] as any[],
      };
    }
  };
  team1.members.forEach((m) => initAgg(m.steam_id, m.steam_tag, "team1"));
  team2.members.forEach((m) => initAgg(m.steam_id, m.steam_tag, "team2"));

  for (let ri = 0; ri < totalRounds; ri++) {
    const roundNumber = ri + 1;
    const firstHalf = roundNumber <= 12;
    const team1SideThisRound: Side = firstHalf ? team1.firstHalfSide : (team1.firstHalfSide === "CT" ? "TERRORIST" : "CT");
    const team2SideThisRound: Side = team1SideThisRound === "CT" ? "TERRORIST" : "CT";
    const winnerKey = winners[ri];
    const winnerSide: Side = winnerKey === "team1" ? team1SideThisRound : team2SideThisRound;
    const isPistol = roundNumber === 1 || roundNumber === 13;

    // Economy
    const team1Equip = isPistol ? 800 : sampleEquip(rng, roundNumber, ri, "team1");
    const team2Equip = isPistol ? 800 : sampleEquip(rng, roundNumber, ri, "team2");
    const team1Buy = classifyBuyType(team1Equip, roundNumber);
    const team2Buy = classifyBuyType(team2Equip, roundNumber);

    // End reason
    const bombPlanted = rng() < (winnerSide === "TERRORIST" ? 0.7 : 0.35);
    let endReason: EndReason;
    let bomb: any = null;
    if (bombPlanted) {
      const site: "A" | "B" = rng() > 0.5 ? "A" : "B";
      const tSideMembers = team1SideThisRound === "TERRORIST" ? team1.members : team2.members;
      const planter = tSideMembers[Math.floor(rng() * tSideMembers.length)];
      if (winnerSide === "TERRORIST") {
        endReason = rng() < 0.55 ? "target_bombed" : "ct_elimination";
        bomb = { planted: true, site, planter_steamid: planter.steam_id, tick: 40000 + ri * 5000, defused: false, defuser_steamid: null };
      } else {
        endReason = rng() < 0.6 ? "bomb_defused" : "t_elimination";
        const ctMembers = team1SideThisRound === "CT" ? team1.members : team2.members;
        const defuser = ctMembers[Math.floor(rng() * ctMembers.length)];
        bomb = { planted: true, site, planter_steamid: planter.steam_id, tick: 40000 + ri * 5000,
          defused: endReason === "bomb_defused", defuser_steamid: endReason === "bomb_defused" ? defuser.steam_id : null };
      }
    } else {
      // No plant → elimination or time expired
      const roll = rng();
      if (roll < 0.7) {
        endReason = winnerSide === "CT" ? "t_elimination" : "ct_elimination";
      } else {
        endReason = "round_time_expired";
      }
    }

    // Kills
    const killCount = 3 + Math.floor(rng() * 6);
    const attackersSide = (side: Side) => side === "CT"
      ? (team1SideThisRound === "CT" ? team1.members : team2.members)
      : (team1SideThisRound === "TERRORIST" ? team1.members : team2.members);
    const winnerMembers = attackersSide(winnerSide);
    const loserSide: Side = winnerSide === "CT" ? "TERRORIST" : "CT";
    const loserMembers = attackersSide(loserSide);
    const kills: any[] = [];
    let openingSet = false;
    let loserDeaths = 0;
    for (let k = 0; k < killCount; k++) {
      const attackerFromWinner = rng() < 0.65;
      const attackerPool = attackerFromWinner ? winnerMembers : loserMembers;
      const victimPool = attackerFromWinner ? loserMembers : winnerMembers;
      const attacker = attackerPool[Math.floor(rng() * attackerPool.length)];
      const victim = victimPool[Math.floor(rng() * victimPool.length)];
      const assister = rng() < 0.25 ? attackerPool[Math.floor(rng() * attackerPool.length)] : null;
      const weapon = pickWeapon(rng, isPistol);
      const headshot = rng() < 0.42;
      const wallbang = rng() < 0.06;
      const distance = Math.round(200 + rng() * 1800);
      const is_opening = !openingSet;
      openingSet = true;
      kills.push({
        attacker: attacker.steam_id, victim: victim.steam_id,
        assister: assister?.steam_id ?? null, weapon,
        headshot, wallbang, distance, is_opening,
        tick: 20000 + ri * 5000 + k * 200,
      });
      // Aggregate
      const a = playerAgg[attacker.steam_id];
      const v = playerAgg[victim.steam_id];
      a.kills += 1;
      if (headshot) a.hs_kills += 1;
      if (AWP_WEAPONS.includes(weapon)) a.awp_kills += 1;
      if (PISTOL_WEAPONS.includes(weapon)) a.pistol_kills += 1;
      a.damage += 100 + Math.floor(rng() * 40);
      v.deaths += 1;
      if (is_opening) {
        a.first_kills += 1;
        v.first_deaths += 1;
      }
      if (assister) playerAgg[assister.steam_id].assists += 1;
      if (attackerFromWinner) loserDeaths += 1;
    }

    // Clutch detection: if the winning side has only 1 survivor vs >=1 enemy survivors
    const enemyAlive = Math.max(0, 5 - loserDeaths);
    const winnerAliveEstimate = Math.max(1, 5 - Math.floor(killCount * 0.3));
    let clutch: any = null;
    if (winnerAliveEstimate === 1 && enemyAlive >= 1 && enemyAlive <= 4) {
      // Pick last winner-side attacker as clutcher
      const clutcher = winnerMembers[Math.floor(rng() * winnerMembers.length)];
      clutch = { player_steamid: clutcher.steam_id, vs: enemyAlive, won: true };
      playerAgg[clutcher.steam_id].clutches_won += 1;
      playerAgg[clutcher.steam_id].clutches_total += 1;
    } else if (rng() < 0.05) {
      // Lost clutch attempt on the losing side
      const attempted = loserMembers[Math.floor(rng() * loserMembers.length)];
      const vs = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
      clutch = { player_steamid: attempted.steam_id, vs, won: false };
      playerAgg[attempted.steam_id].clutches_total += 1;
    }

    // Utility for a couple of random players per round
    for (const m of [...team1.members, ...team2.members]) {
      const p = playerAgg[m.steam_id];
      const utilRoll = rng();
      if (utilRoll < 0.4) p.utility_damage += Math.floor(rng() * 25);
      if (utilRoll < 0.3) p.enemies_flashed += Math.floor(rng() * 2);
      // KAST heuristic: player is KAST-positive if they got a kill, assist, or (approximated) survived
      const gotKill = kills.some((k) => k.attacker === m.steam_id);
      const gotAssist = kills.some((k) => k.assister === m.steam_id);
      const died = kills.some((k) => k.victim === m.steam_id);
      if (gotKill || gotAssist || !died) p.rounds_with_kast += 1;
      p.per_round.push({
        round: roundNumber,
        kills: kills.filter((k) => k.attacker === m.steam_id).length,
        deaths: died ? 1 : 0,
        damage: kills.filter((k) => k.attacker === m.steam_id).length * 100,
      });
    }

    // MVP: attacker with most kills this round on winning side
    const winnerKills = winnerMembers
      .map((m) => ({ sid: m.steam_id, k: kills.filter((x) => x.attacker === m.steam_id).length }))
      .sort((a, b) => b.k - a.k);
    if (winnerKills[0]?.k > 0) playerAgg[winnerKills[0].sid].mvps += 1;

    rounds.push({
      round_number: roundNumber,
      is_pistol: isPistol,
      winner_side: winnerSide,
      end_reason: endReason,
      clutch,
      bomb,
      buy_types: { team1: team1Buy, team2: team2Buy },
      kills,
      economy: {
        team1: { avg_equip: team1Equip, avg_balance: 800 + Math.floor(rng() * 8000), buy_type: team1Buy },
        team2: { avg_equip: team2Equip, avg_balance: 800 + Math.floor(rng() * 8000), buy_type: team2Buy },
      },
    });
  }

  // Build players dict
  const players: Record<string, any> = {};
  for (const agg of Object.values(playerAgg)) {
    const adr = +(agg.damage / totalRounds).toFixed(1);
    const kast = +((agg.rounds_with_kast / totalRounds) * 100).toFixed(1);
    const rating = calculateRating(agg, totalRounds);
    players[agg.sid] = {
      steamid: agg.sid,
      name: agg.name,
      team: agg.team,
      role_deduced: deduceRole(agg, totalRounds),
      avatar_url: null,
      stats: {
        kills: agg.kills, deaths: agg.deaths, assists: agg.assists,
        hs_kills: agg.hs_kills, damage: agg.damage, adr,
        kast, rating,
        first_kills: agg.first_kills, first_deaths: agg.first_deaths,
        clutches_won: agg.clutches_won, clutches_total: agg.clutches_total,
        utility_damage: agg.utility_damage, enemies_flashed: agg.enemies_flashed,
        mvps: agg.mvps,
      },
      per_round: agg.per_round,
    };
  }

  // Buy-type summary
  const emptySummary = () => Object.fromEntries(BUY_ORDER.map((b) => [b, { wins: 0, losses: 0 }]));
  const summary: any = { team1: emptySummary(), team2: emptySummary() };
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const t1Won = winners[i] === "team1";
    summary.team1[r.buy_types.team1][t1Won ? "wins" : "losses"] += 1;
    summary.team2[r.buy_types.team2][t1Won ? "losses" : "wins"] += 1;
  }

  return {
    schema_version: 2 as const,
    match: {
      map, server: "", date: new Date().toISOString(), match_type: matchType, total_rounds: totalRounds,
      score: { team1: scoreTeam1, team2: scoreTeam2 },
      teams: {
        team1: { name: team1.name, first_half_side: team1.firstHalfSide, player_steamids: team1.members.map((m) => m.steam_id) },
        team2: { name: team2.name, first_half_side: team2.firstHalfSide, player_steamids: team2.members.map((m) => m.steam_id) },
      },
    },
    rounds,
    players,
    buy_type_summary: summary,
  };
}

interface PlayerAgg {
  sid: string; name: string; team: "team1" | "team2";
  kills: number; deaths: number; assists: number;
  hs_kills: number; damage: number;
  rounds_with_kast: number;
  first_kills: number; first_deaths: number;
  clutches_won: number; clutches_total: number;
  utility_damage: number; enemies_flashed: number;
  mvps: number;
  awp_kills: number; pistol_kills: number;
  per_round: any[];
}

function classifyBuyType(avgEquip: number, roundNumber: number): BuyType {
  if (roundNumber === 1 || roundNumber === 13) return "pistol";
  if (avgEquip < 1000) return "full_eco";
  if (avgEquip < 2500) return "eco";
  if (avgEquip < 4000) return "half_buy";
  return "full_buy";
}

function sampleEquip(rng: () => number, roundNumber: number, ri: number, _team: string): number {
  const r = rng();
  if (r < 0.08) return 500 + Math.floor(rng() * 400);   // full_eco
  if (r < 0.22) return 1200 + Math.floor(rng() * 1200); // eco
  if (r < 0.42) return 2700 + Math.floor(rng() * 1200); // half_buy
  return 4200 + Math.floor(rng() * 1500);               // full_buy
}

function pickWeapon(rng: () => number, isPistol: boolean): string {
  if (isPistol) return PISTOL_WEAPONS[Math.floor(rng() * PISTOL_WEAPONS.length)];
  const r = rng();
  if (r < 0.12) return AWP_WEAPONS[0];
  if (r < 0.85) return RIFLE_WEAPONS[Math.floor(rng() * RIFLE_WEAPONS.length)];
  return PISTOL_WEAPONS[Math.floor(rng() * PISTOL_WEAPONS.length)];
}

function calculateRating(a: PlayerAgg, totalRounds: number): number {
  // Simplified HLTV-esque rating
  const kpr = a.kills / totalRounds;
  const dpr = a.deaths / totalRounds;
  const impact = (2.13 * kpr) + (0.42 * (a.assists / totalRounds)) - 0.41;
  const rating = 0.0073 * ((a.rounds_with_kast / totalRounds) * 100)
    + 0.3591 * kpr
    - 0.5329 * dpr
    + 0.2372 * impact
    + 0.0032 * (a.damage / totalRounds)
    + 0.1587;
  return +Math.max(0, rating).toFixed(2);
}

function deduceRole(a: PlayerAgg, totalRounds: number): "AWPer" | "Entry" | "Lurker" | "Support" | null {
  // AWPer: >=20% of kills are AWP kills AND >=6 AWP kills
  if (a.awp_kills >= 6 && (a.awp_kills / Math.max(a.kills, 1)) >= 0.2) return "AWPer";
  // Entry: first_kills >= totalRounds * 0.15 (aggressive opener)
  if (a.first_kills >= Math.max(3, Math.floor(totalRounds * 0.15))) return "Entry";
  // Support: assists/(kills+1) high AND utility_damage above average
  if (a.assists >= 6 && a.utility_damage >= 80) return "Support";
  // Lurker: low first_deaths AND low first_kills but positive rating (survives openings)
  if (a.first_deaths <= 2 && a.first_kills <= 2 && a.kills >= totalRounds * 0.6) return "Lurker";
  return null; // IGL is impossible to deduce from data alone
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seededRng(seed: number) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return (((s ^ (s >>> 14)) >>> 0) / 4294967296);
  };
}
