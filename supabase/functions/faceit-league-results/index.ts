import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACEIT_BASE = "https://open.faceit.com/data/v4";

type Settings = Record<string, string>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes.user) return json({ error: "invalid token" }, 401);

    const { data: rows, error: settingsErr } = await admin
      .from("team_settings")
      .select("key,value")
      .in("key", [
        "faceit_team_url",
        "faceit_team_id",
        "faceit_league_url",
        "faceit_league_id",
        "faceit_season_id",
        "faceit_championship_id",
      ]);
    if (settingsErr) return json({ error: settingsErr.message }, 500);

    const settings = Object.fromEntries((rows ?? []).map((row) => [row.key, row.value?.trim() ?? ""])) as Settings;
    let teamId = settings.faceit_team_id || extractTeamId(settings.faceit_team_url);
    const teamSlug = extractTeamSlug(settings.faceit_team_url);
    const leagueParts = extractLeagueParts(settings.faceit_league_url);
    const leagueId = settings.faceit_league_id || leagueParts.leagueId;
    const seasonId = settings.faceit_season_id || leagueParts.seasonId;
    const apiKey = Deno.env.get("FACEIT_API_KEY");

    if (!apiKey) {
      return json({
        configured: false,
        linksConfigured: Boolean(teamId || teamSlug || leagueId || seasonId),
        reason: "Los links de FACEIT ya están configurados, pero FACEIT Data API requiere FACEIT_API_KEY para leer resultados live.",
        team: teamId ? { id: teamId, name: "Tactical Chaos", avatar: null, members: null } : null,
        competition: leagueId ? { id: leagueId, season_id: seasonId || null, name: "ESEA League - Temporada 58", status: "api_key_required", region: null } : null,
        setup: requiredSetup(),
      });
    }

    if (!teamId && teamSlug) {
      const search = await faceitFetch(`/search/teams?nickname=${encodeURIComponent(teamSlug)}&game=cs2&offset=0&limit=10`, apiKey);
      teamId = search?.items?.[0]?.team_id ?? search?.items?.[0]?.id ?? "";
    }

    if (!teamId) {
      return json({
        configured: false,
        reason: "Falta configurar faceit_team_url o faceit_team_id en team_settings.",
        setup: requiredSetup(),
      });
    }

    const team = await faceitFetch(`/teams/${encodeURIComponent(teamId)}`, apiKey);
    const championshipId = settings.faceit_championship_id || await findEseaChampionshipId(teamId, apiKey);

    if (!championshipId && leagueId && seasonId) {
      const leagueSeason = await faceitFetch(
        `/leagues/${encodeURIComponent(leagueId)}/seasons/${encodeURIComponent(seasonId)}`,
        apiKey,
      );
      return json({
        configured: true,
        team: normalizeTeam(team, teamId),
        competition: {
          id: leagueId,
          season_id: seasonId,
          name: leagueSeason?.name ?? leagueSeason?.season_name ?? "ESEA League",
          status: leagueSeason?.status ?? null,
          region: leagueSeason?.region ?? null,
        },
        matches: [],
        record: { wins: 0, losses: 0 },
        reason: "Liga/temporada encontrada. Para resultados por equipo exactos, configurá faceit_championship_id si FACEIT no expone matches en este endpoint.",
        setup: requiredSetup(),
      });
    }

    if (!championshipId) {
      return json({
        configured: true,
        team: normalizeTeam(team, teamId),
        competition: null,
        matches: [],
        record: { wins: 0, losses: 0 },
        reason: "Equipo encontrado, pero no se detectó championship ESEA. Configurá faceit_championship_id para resultados exactos.",
        setup: requiredSetup(),
      });
    }

    const [championship, matchesPayload] = await Promise.all([
      faceitFetch(`/championships/${encodeURIComponent(championshipId)}`, apiKey),
      faceitFetch(`/championships/${encodeURIComponent(championshipId)}/matches?offset=0&limit=50`, apiKey),
    ]);

    const allMatches = (matchesPayload?.items ?? []) as Array<Record<string, unknown>>;
    const teamMatches = allMatches
      .filter((match) => matchIncludesTeam(match, teamId, team?.nickname))
      .map((match) => normalizeMatch(match, teamId, team?.nickname))
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
      .slice(0, 8);

    const finished = teamMatches.filter((match) => match.status === "finished" && match.score);
    const wins = finished.filter((match) => match.won).length;

    return json({
      configured: true,
      team: normalizeTeam(team, teamId),
      competition: {
        id: championshipId,
        name: championship?.name ?? championship?.championship_name ?? "ESEA League",
        status: championship?.status ?? null,
        region: championship?.region ?? null,
      },
      matches: teamMatches,
      record: { wins, losses: Math.max(0, finished.length - wins) },
      setup: requiredSetup(),
    });
  } catch (error) {
    return json({ error: String((error as Error).message), configured: false, setup: requiredSetup() }, 500);
  }
});

async function faceitFetch(path: string, apiKey: string) {
  const res = await fetch(`${FACEIT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`FACEIT ${path} devolvió ${res.status}`);
  }
  return res.json();
}

async function findEseaChampionshipId(teamId: string, apiKey: string) {
  try {
    const payload = await faceitFetch(`/teams/${encodeURIComponent(teamId)}/tournaments?offset=0&limit=20`, apiKey);
    const items = (payload?.items ?? []) as Array<Record<string, unknown>>;
    const esea = items.find((item) => /esea|league/i.test(String(item.name ?? item.championship_name ?? "")));
    return String(esea?.championship_id ?? esea?.id ?? "");
  } catch {
    return "";
  }
}

function extractTeamId(value = "") {
  const uuid = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  return uuid ?? "";
}

function extractTeamSlug(value = "") {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((part) => part === "teams");
    return idx >= 0 ? decodeURIComponent(parts[idx + 1] ?? "") : "";
  } catch {
    return "";
  }
}

function extractLeagueParts(value = "") {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const leagueIndex = parts.findIndex((part) => part === "league");
    return {
      leagueId: parts[leagueIndex + 2] ?? "",
      seasonId: parts[leagueIndex + 3] ?? "",
    };
  } catch {
    return { leagueId: "", seasonId: "" };
  }
}

function normalizeTeam(team: Record<string, unknown> | null, fallbackId: string) {
  return {
    id: String(team?.team_id ?? fallbackId),
    name: String(team?.nickname ?? team?.name ?? "Equipo FACEIT"),
    avatar: typeof team?.avatar === "string" ? team.avatar : null,
    members: Array.isArray(team?.members) ? team.members.length : null,
  };
}

function matchIncludesTeam(match: Record<string, unknown>, teamId: string, teamName?: string) {
  const serialized = JSON.stringify(match).toLowerCase();
  return serialized.includes(teamId.toLowerCase()) || (!!teamName && serialized.includes(String(teamName).toLowerCase()));
}

function normalizeMatch(match: Record<string, unknown>, teamId: string, teamName?: string) {
  const teams = match.teams as Record<string, { team_id?: string; nickname?: string; name?: string }> | undefined;
  const factions = [teams?.faction1, teams?.faction2].filter(Boolean);
  const own = factions.find((team) => team?.team_id === teamId || team?.nickname === teamName || team?.name === teamName);
  const opp = factions.find((team) => team !== own);
  const results = match.results as { score?: Record<string, number>; winner?: string } | undefined;
  const ownFaction = own === teams?.faction1 ? "faction1" : "faction2";
  const oppFaction = ownFaction === "faction1" ? "faction2" : "faction1";
  const ownScore = results?.score?.[ownFaction];
  const oppScore = results?.score?.[oppFaction];

  return {
    id: String(match.match_id ?? match.id ?? crypto.randomUUID()),
    status: String(match.status ?? ""),
    startedAt: typeof match.started_at === "string" ? match.started_at : null,
    opponent: opp?.nickname ?? opp?.name ?? "Rival",
    score: Number.isFinite(ownScore) && Number.isFinite(oppScore) ? `${ownScore} - ${oppScore}` : null,
    won: results?.winner === ownFaction,
  };
}

function requiredSetup() {
  return {
    env: "FACEIT_API_KEY",
    teamSettings: [
      "faceit_team_url o faceit_team_id",
      "faceit_league_url o faceit_league_id + faceit_season_id",
      "faceit_championship_id recomendado para resultados exactos",
    ],
    api: "FACEIT Data API v4: /teams, /teams/{id}/tournaments, /leagues/{id}/seasons/{season_id}, /championships/{id}/matches",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
