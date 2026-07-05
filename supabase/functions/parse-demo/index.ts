import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: real .dem binary parsing is not yet wired in. Until it is, this
// function runs a "simulated" import that:
//   1) verifies the demo file exists in storage
//   2) generates plausible per-player stats for the current roster
//   3) tries to match each demo player to a team_member by steam_id (exact)
//      first, then by steam_tag (case-insensitive) as fallback
//   4) inserts a matches row + player_stats rows
//   5) returns a detailed report so the UI can show what was imported and
//      how each row was linked
// Once a Deno-compatible .dem parser is wired in, only the "generate" block
// needs to change — the roster matching, DB writes and response shape stay.

const MAPS = ["Mirage", "Inferno", "Nuke", "Anubis", "Ancient", "Dust2", "Vertigo", "Overpass", "Train"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { path } = await req.json();
    if (!path || typeof path !== "string") return json({ error: "path requerido" }, 400);

    const { data: file, error } = await admin.storage.from("demos").download(path);
    if (error || !file) return json({ error: "Demo no encontrada: " + (error?.message ?? "unknown") }, 404);

    // Deterministic RNG so re-uploading the same file gives the same "parse".
    const rng = seededRng(hashString(path));

    // Roster available for matching. Skip coaches — they don't get stats.
    const { data: teamRaw } = await admin
      .from("team_members")
      .select("user_id, steam_id, steam_tag, player_name, is_coach, steam_avatar_url")
      .eq("is_coach", false);
    const roster = (teamRaw ?? []).filter((m) => m.steam_id);

    // --- SIMULATED PARSE OUTPUT -------------------------------------------
    const map = MAPS[Math.floor(rng() * MAPS.length)];
    const startingSide: "CT" | "TR" = rng() > 0.5 ? "CT" : "TR";
    const scoreUs = 6 + Math.floor(rng() * 10);
    const scoreThem = 6 + Math.floor(rng() * 10);
    const totalRounds = scoreUs + scoreThem;
    const rival = ["Team Nova", "Ratones", "Gauchos", "LosPibes", "Puntería GC"][Math.floor(rng() * 5)];

    // Build demo player rows: every rostered player + one "guest" that hits
    // the steam_tag fallback path so the UI can showcase both link modes.
    const demoPlayers = roster.map((m) => genStats(m.steam_id!, m.steam_tag ?? m.player_name, totalRounds, rng));
    if (roster.length > 0) {
      const tagFallback = roster[0].steam_tag ?? roster[0].player_name;
      // extra guest with wrong steam_id but matching tag → forces tag fallback path
      demoPlayers.push(
        genStats("76561190000000000", tagFallback, totalRounds, rng, { guest: true }),
      );
    }
    // -----------------------------------------------------------------------

    // Insert match row
    const { data: matchRow, error: matchErr } = await admin
      .from("matches")
      .insert({
        date: new Date().toISOString(),
        type: "OFFICIAL",
        map,
        rival,
        score_us: scoreUs,
        score_them: scoreThem,
        starting_side: startingSide,
        ct_pistol: "WIN",
        ct_second_round: "WIN",
        ct_setup: "WIN",
        ct_finalizacion: "WIN",
        tr_pistol: "WIN",
        tr_second_round: "WIN",
        tr_setup: "WIN",
        tr_finalizacion: "WIN",
        notes: `Importado desde demo: ${path}`,
        recorded_by: "demo-import",
      })
      .select("id")
      .single();
    if (matchErr) return json({ error: "matches insert: " + matchErr.message }, 500);

    // Match + insert player_stats
    const report: Array<{
      steam_id: string;
      steam_tag: string;
      matched_user_id: string | null;
      matched_player_name: string | null;
      match_type: "steam_id" | "steam_tag" | "unmatched";
      avatar_url: string | null;
      kills: number;
      deaths: number;
      assists: number;
      adr: number;
      hs_pct: number;
      kast_pct: number;
      rating: number;
    }> = [];

    for (const p of demoPlayers) {
      let matched = roster.find((r) => r.steam_id === p.steam_id);
      let matchType: "steam_id" | "steam_tag" | "unmatched" = matched ? "steam_id" : "unmatched";
      if (!matched) {
        matched = roster.find(
          (r) => (r.steam_tag ?? "").toLowerCase() === p.steam_tag.toLowerCase(),
        );
        if (matched) matchType = "steam_tag";
      }

      await admin.from("player_stats").insert({
        match_id: matchRow.id,
        user_id: matched?.user_id ?? null,
        steam_id: p.steam_id,
        steam_tag: p.steam_tag,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        adr: p.adr,
        hs_pct: p.hs_pct,
        kast_pct: p.kast_pct,
        kr: +(p.kills / totalRounds).toFixed(2),
        dr: +(p.deaths / totalRounds).toFixed(2),
        fk: p.fk,
        fd: p.fd,
        flash_assists: p.flash_assists,
        util_dmg: p.util_dmg,
        rating: p.rating,
      });

      report.push({
        steam_id: p.steam_id,
        steam_tag: p.steam_tag,
        matched_user_id: matched?.user_id ?? null,
        matched_player_name: matched?.player_name ?? null,
        match_type: matchType,
        avatar_url: matched?.steam_avatar_url ?? null,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        adr: p.adr,
        hs_pct: p.hs_pct,
        kast_pct: p.kast_pct,
        rating: p.rating,
      });
    }

    return json({
      status: "imported",
      simulated: true,
      match_id: matchRow.id,
      file_size: file.size,
      map,
      score_us: scoreUs,
      score_them: scoreThem,
      rival,
      starting_side: startingSide,
      total_rounds: totalRounds,
      players: report,
      summary: {
        total: report.length,
        by_steam_id: report.filter((r) => r.match_type === "steam_id").length,
        by_steam_tag: report.filter((r) => r.match_type === "steam_tag").length,
        unmatched: report.filter((r) => r.match_type === "unmatched").length,
      },
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function genStats(
  steamId: string,
  steamTag: string,
  totalRounds: number,
  rng: () => number,
  opts: { guest?: boolean } = {},
) {
  const kills = Math.floor(10 + rng() * (opts.guest ? 12 : 22));
  const deaths = Math.floor(10 + rng() * 15);
  const assists = Math.floor(2 + rng() * 8);
  const adr = +(60 + rng() * 55).toFixed(1);
  const hs_pct = +(30 + rng() * 40).toFixed(1);
  const kast_pct = +(60 + rng() * 25).toFixed(1);
  const fk = Math.floor(rng() * 5);
  const fd = Math.floor(rng() * 5);
  const flash_assists = Math.floor(rng() * 6);
  const util_dmg = Math.floor(rng() * 120);
  const rating = +(0.6 + rng() * 1.0).toFixed(2);
  return {
    steam_id: steamId,
    steam_tag: steamTag,
    kills, deaths, assists, adr, hs_pct, kast_pct, fk, fd, flash_assists, util_dmg, rating,
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
