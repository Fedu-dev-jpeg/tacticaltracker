import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SIMULATED parser: produces plausible, deterministic-per-file data.
// Once a real .dem binary parser is wired in, only the generateAnalysis()
// block needs to change — the roster matching, DB writes and response
// shape stay the same.

const MAPS = ["Mirage", "Inferno", "Nuke", "Anubis", "Ancient", "Dust2", "Vertigo", "Overpass", "Train"];
const RIVAL_NAMES = ["Team Nova", "Ratones", "Gauchos", "LosPibes", "Puntería GC"];
const RIVAL_TAGS = [
  ["KING", "meka", "agustoN", "jonny", "Concepts"],
  ["hunter", "vito", "ninja", "cold", "sparks"],
  ["neo", "duke", "milo", "wraith", "vex"],
];
const ROLES = ["A Anchor", "A Extremity", "B Anchor", "B Cave", "B Extremity", "Awper", "Mid"];
const BUY_TYPES = ["P", "FE", "E", "HB", "FB"]; // Pistol, Full Eco, Eco, Half Buy, Full Buy
const END_REASONS = ["Bomb", "Elimination", "Time", "Defuse"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Auth: require signed-in admin ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const { path, rival: rivalOverride, map: mapOverride, match_type: matchTypeOverride } = body ?? {};
    if (!path || typeof path !== "string") return json({ error: "path requerido" }, 400);


    // Skip any storage read — downloading/listing under concurrency exceeds the edge memory limit.
    const fileSize = 0;

    const rng = seededRng(hashString(path));

    const { data: teamRaw } = await admin
      .from("team_members")
      .select("user_id, steam_id, steam_tag, player_name, is_coach, steam_avatar_url")
      .eq("is_coach", false);
    const roster = (teamRaw ?? []).filter((m) => m.steam_id);

    // --- SIMULATED PARSE (with user-provided overrides where available) ---
    const map = (typeof mapOverride === "string" && mapOverride.trim())
      ? mapOverride.trim()
      : MAPS[Math.floor(rng() * MAPS.length)];
    const matchType = (matchTypeOverride === "TRAINING" || matchTypeOverride === "OFFICIAL")
      ? matchTypeOverride
      : "OFFICIAL";
    const startingSide: "CT" | "TR" = rng() > 0.5 ? "CT" : "TR";
    const scoreUs = 6 + Math.floor(rng() * 10);
    const scoreThem = 6 + Math.floor(rng() * 10);
    const totalRounds = scoreUs + scoreThem;
    // Rival name: prefer the override (user confirmation). Leave empty for the review step.
    const rival = (typeof rivalOverride === "string" && rivalOverride.trim())
      ? rivalOverride.trim()
      : "Sin definir";
    const rivalTags = RIVAL_TAGS[Math.floor(rng() * RIVAL_TAGS.length)];

    // Build demo player rows for our roster — no extra "guest" duplicate.
    const usPlayers = roster.map((m) => genPlayer(m.steam_id!, m.steam_tag ?? m.player_name, totalRounds, rng, ROLES, false));

    // Rival team players (not stored in player_stats — only inside demo_data)
    const themPlayers = rivalTags.map((tag, i) =>
      genPlayer(`76561198${(100000000 + Math.floor(rng() * 900000000))}`, tag, totalRounds, rng, ROLES, false, i === 0),
    );

    // Rounds timeline
    const rounds = buildRounds(totalRounds, scoreUs, scoreThem, startingSide, rng);

    // Economy summary
    const economy = buildEconomy(rounds);

    // Insert match row
    const { data: matchRow, error: matchErr } = await admin
      .from("matches")
      .insert({
        date: new Date().toISOString(),
        type: matchType,
        map,
        rival,
        score_us: scoreUs,
        score_them: scoreThem,
        starting_side: startingSide,
        ct_pistol: "WIN", ct_second_round: "WIN", ct_setup: "WIN", ct_finalizacion: "WIN",
        tr_pistol: "WIN", tr_second_round: "WIN", tr_setup: "WIN", tr_finalizacion: "WIN",
        notes: `Importado desde demo: ${path}`,
        recorded_by: "demo-import",
      })
      .select("id")
      .single();
    if (matchErr) return json({ error: "matches insert: " + matchErr.message }, 500);

    // Vinculación + insert de player_stats
    const report: any[] = [];
    for (const p of usPlayers) {
      let matched = roster.find((r) => r.steam_id === p.steam_id);
      let matchType: "steam_id" | "steam_tag" | "unmatched" = matched ? "steam_id" : "unmatched";
      if (!matched) {
        matched = roster.find((r) => (r.steam_tag ?? "").toLowerCase() === p.steam_tag.toLowerCase());
        if (matched) matchType = "steam_tag";
      }

      await admin.from("player_stats").insert({
        match_id: matchRow.id,
        user_id: matched?.user_id ?? null,
        steam_id: p.steam_id,
        steam_tag: p.steam_tag,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr: p.adr, hs_pct: p.hs_pct, kast_pct: p.kast_pct,
        kr: +(p.kills / totalRounds).toFixed(2),
        dr: +(p.deaths / totalRounds).toFixed(2),
        fk: p.fk, fd: p.fd, flash_assists: p.flash_assists,
        util_dmg: p.util_dmg, rating: p.rating,
      });

      report.push({
        steam_id: p.steam_id, steam_tag: p.steam_tag,
        matched_user_id: matched?.user_id ?? null,
        matched_player_name: matched?.player_name ?? null,
        match_type: matchType,
        avatar_url: matched?.steam_avatar_url ?? null,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        adr: p.adr, hs_pct: p.hs_pct, kast_pct: p.kast_pct, rating: p.rating,
      });
    }

    // Rich demo_data blob
    const demoData = {
      version: 1,
      generated_at: new Date().toISOString(),
      map, rival,
      score_us: scoreUs, score_them: scoreThem,
      starting_side: startingSide,
      total_rounds: totalRounds,
      team_us: {
        name: "Hambrientos",
        score: scoreUs,
        players: usPlayers.map((p) => playerForBlob(p, scoreUs > scoreThem)),
      },
      team_them: {
        name: rival,
        score: scoreThem,
        players: themPlayers.map((p) => playerForBlob(p, scoreThem > scoreUs)),
      },
      rounds,
      economy,
      charts: buildCharts(usPlayers, themPlayers),
    };

    await admin.from("matches").update({ demo_data: demoData }).eq("id", matchRow.id);

    return json({
      status: "imported",
      simulated: true,
      match_id: matchRow.id,
      file_size: fileSize,
      map, rival,
      score_us: scoreUs, score_them: scoreThem,
      starting_side: startingSide,
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

function genPlayer(steamId: string, tag: string, totalRounds: number, rng: () => number, allRoles: string[], guest = false, isStar = false) {
  const kills = Math.floor((isStar ? 16 : 10) + rng() * (guest ? 12 : 22));
  const deaths = Math.floor(10 + rng() * 15);
  const assists = Math.floor(2 + rng() * 8);
  const adr = +(60 + rng() * 55).toFixed(1);
  const hs_pct = +(30 + rng() * 40).toFixed(1);
  const kast_pct = +(60 + rng() * 25).toFixed(1);
  const fk = Math.floor(rng() * 5);
  const fd = Math.floor(rng() * 5);
  const flash_assists = Math.floor(rng() * 6);
  const util_dmg = Math.floor(rng() * 120);
  const rating = +(0.5 + rng() * 1.2).toFixed(2);
  const damage = Math.floor(adr * totalRounds);
  const trades = Math.floor(rng() * 5);
  const impact = +(0.4 + rng() * 1.5).toFixed(2);
  // Assign 1-2 roles
  const nRoles = 1 + Math.floor(rng() * 2);
  const roles: string[] = [];
  const pool = [...allRoles];
  for (let i = 0; i < nRoles && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    roles.push(pool.splice(idx, 1)[0]);
  }
  return {
    steam_id: steamId, steam_tag: tag,
    kills, deaths, assists, adr, hs_pct, kast_pct,
    fk, fd, flash_assists, util_dmg, rating,
    damage, trades, impact, roles,
  };
}

function playerForBlob(p: any, teamWon: boolean) {
  const kda = `${p.kills}/${p.deaths}/${p.assists}`;
  const plusMinus = p.kills - p.deaths;
  return {
    steam_id: p.steam_id,
    tag: p.steam_tag,
    roles: p.roles,
    kills: p.kills, deaths: p.deaths, assists: p.assists,
    kda,
    plus_minus: plusMinus,
    adr: p.adr,
    kast_pct: p.kast_pct,
    rating: p.rating,
    impact: p.impact,
    damage: p.damage,
    entry_kd: `${p.fk}/${p.fd}`,
    trades: p.trades,
    won: teamWon,
  };
}

function buildRounds(total: number, scoreUs: number, scoreThem: number, startingSide: "CT" | "TR", rng: () => number) {
  const rounds: any[] = [];
  const wins: ("us" | "them")[] = [];
  for (let i = 0; i < scoreUs; i++) wins.push("us");
  for (let i = 0; i < scoreThem; i++) wins.push("them");
  // Shuffle keeping first round distinct
  for (let i = wins.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wins[i], wins[j]] = [wins[j], wins[i]];
  }

  const opposite = (s: "CT" | "TR") => (s === "CT" ? "TR" : "CT");
  const firstHalfUsSide = startingSide;
  const secondHalfUsSide = opposite(startingSide);

  for (let r = 0; r < total; r++) {
    const isFirstHalf = r < 12;
    const usSide = isFirstHalf ? firstHalfUsSide : secondHalfUsSide;
    const themSide = opposite(usSide);
    const winner = wins[r];
    const winnerSide = winner === "us" ? usSide : themSide;
    const survivors = 1 + Math.floor(rng() * 5);
    const enemyRemaining = Math.floor(rng() * 3);
    const reason = END_REASONS[Math.floor(rng() * END_REASONS.length)];
    const isPistol = r === 0 || r === 12;
    const usBuy = isPistol ? "P" : BUY_TYPES[1 + Math.floor(rng() * (BUY_TYPES.length - 1))];
    const themBuy = isPistol ? "P" : BUY_TYPES[1 + Math.floor(rng() * (BUY_TYPES.length - 1))];
    rounds.push({
      n: r + 1,
      winner,
      winner_team_label: winner === "us" ? "Team 1" : "Team 2",
      winner_side: winnerSide,
      survivors,
      enemy_remaining: enemyRemaining,
      reason,
      is_pistol: isPistol,
      us_side: usSide,
      us_buy: usBuy,
      them_buy: themBuy,
    });
  }
  return rounds;
}

function buildEconomy(rounds: any[]) {
  const summary = (side: "us" | "them") => {
    const wins: Record<string, number> = { P: 0, FE: 0, E: 0, HB: 0, FB: 0 };
    const losses: Record<string, number> = { P: 0, FE: 0, E: 0, HB: 0, FB: 0 };
    for (const r of rounds) {
      const buy = side === "us" ? r.us_buy : r.them_buy;
      if (r.winner === side) wins[buy] = (wins[buy] ?? 0) + 1;
      else losses[buy] = (losses[buy] ?? 0) + 1;
    }
    return { wins, losses };
  };
  return { us: summary("us"), them: summary("them") };
}

function buildCharts(us: any[], them: any[]) {
  const all = [...us, ...them].sort((a, b) => b.rating - a.rating);
  return {
    player_rating: all.map((p) => ({ tag: p.steam_tag, value: p.rating })),
    damage_per_round: all.map((p) => ({ tag: p.steam_tag, value: p.adr })),
    total_damage: [...all].sort((a, b) => b.damage - a.damage).map((p) => ({ tag: p.steam_tag, value: p.damage })),
    clutch: us.slice(0, 2).map((p) => ({ tag: p.steam_tag, attempts: 2 + Math.floor(Math.random() * 3), wins: 1 + Math.floor(Math.random() * 2) })),
    entry: all.map((p) => ({ tag: p.steam_tag, fk: p.fk, fd: p.fd, trades: p.trades })),
  };
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
