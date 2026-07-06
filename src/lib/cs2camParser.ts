import { decode } from "@msgpack/msgpack";
import type { RawParsedDemo } from "./demoParser";

type Side = "CT" | "TERRORIST";
type ParserLog = (scope: string, event: string, data: unknown, level?: "info" | "warn" | "error" | "debug") => void;
type ParserProgress = (pct: number, label: string) => void;

interface Cs2CamRoundSummary {
  round_num: number;
  winner: "CT" | "T";
  reason: string;
}

interface Cs2CamMapInfo {
  map_name: string;
  map_number: number;
  round_count: number;
  rounds: Cs2CamRoundSummary[];
}

interface Cs2CamMatchInfoResponse {
  maps: Cs2CamMapInfo[];
  match_info?: {
    match_id: number;
    team1_name?: string;
    team2_name?: string;
    team1_id?: number;
    team2_id?: number;
  };
}

interface Cs2CamRoundPlayer {
  player_name?: string;
  steamid?: string;
  side?: string;
  team_id?: number;
}

interface Cs2CamRoundKill {
  attacker_steamid?: string;
  victim_steamid?: string;
  weapon?: string;
  headshot?: boolean;
  tick?: number;
}

interface Cs2CamRoundDamage {
  attacker_steamid?: string;
  victim_steamid?: string;
  dmg_health?: number;
}

interface Cs2CamRoundPayload {
  round_info?: { winner?: "CT" | "T"; reason?: string };
  players?: Cs2CamRoundPlayer[];
  kills?: Cs2CamRoundKill[];
  damages?: Cs2CamRoundDamage[];
}

const API_BASE = "https://naapi.cs2.cam/api";
const STEAM64_RE = /^7656119\d{10}$/;
const TACTICAL_CHAOS_STEAM_IDS = new Set([
  "76561198847083529",
  "76561198354921400",
  "76561199104616493",
  "76561198894980148",
  "76561199536800035",
]);

export interface Cs2CamImportResult {
  parsed: RawParsedDemo;
  hints: {
    map: string;
    rival: string;
    matchId: number;
    mapNumber: number;
  };
}

export function parseCs2CamUrl(input: string): { matchId: number; mapNumber: number } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("URL inválida. Pegá un link completo de cs2.cam");
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith("cs2.cam")) {
    throw new Error("El link debe ser de cs2.cam");
  }
  const matchId = Number(url.searchParams.get("match_id"));
  const mapNumber = Number(url.searchParams.get("map_number") ?? "1");
  if (!Number.isFinite(matchId) || matchId <= 0) {
    throw new Error("El link no contiene un match_id válido");
  }
  if (!Number.isFinite(mapNumber) || mapNumber <= 0) {
    throw new Error("El link no contiene un map_number válido");
  }
  return { matchId, mapNumber };
}

export async function parseCs2CamMatch(
  inputUrl: string,
  onProgress?: ParserProgress,
  onLog?: ParserLog,
): Promise<Cs2CamImportResult> {
  const { matchId, mapNumber } = parseCs2CamUrl(inputUrl);
  onProgress?.(8, "Consultando match-info en cs2.cam");
  onLog?.("cs2cam", "match-info-start", { matchId, mapNumber });

  const matchInfoRes = await fetch(`${API_BASE}/match-info?match_id=${matchId}`);
  if (!matchInfoRes.ok) {
    throw new Error(`cs2.cam match-info falló (${matchInfoRes.status})`);
  }
  const matchInfo = (await matchInfoRes.json()) as Cs2CamMatchInfoResponse;
  const map = matchInfo.maps?.find((m) => Number(m.map_number) === mapNumber);
  if (!map) throw new Error(`No existe map_number=${mapNumber} para ese match_id`);
  if (!Array.isArray(map.rounds) || map.rounds.length === 0) {
    throw new Error("El mapa no tiene rondas disponibles");
  }

  onProgress?.(15, "Descargando rondas detalladas del mapa");
  onLog?.("cs2cam", "round-fetch-start", { matchId, mapNumber, rounds: map.round_count });

  const roundPayloads: Cs2CamRoundPayload[] = [];
  for (let round = 1; round <= map.round_count; round += 1) {
    const roundRes = await fetch(`${API_BASE}/round-data-msgpack?match_id=${matchId}&map_number=${mapNumber}&round=${round}`);
    if (!roundRes.ok) throw new Error(`No se pudo bajar round ${round} (${roundRes.status})`);
    const bytes = new Uint8Array(await roundRes.arrayBuffer());
    const roundPayload = decode(bytes) as Cs2CamRoundPayload;
    roundPayloads.push(roundPayload);
    const pct = 15 + Math.round((round / Math.max(1, map.round_count)) * 65);
    onProgress?.(pct, `Ronda ${round}/${map.round_count}`);
  }

  const playersBySteamid = new Map<string, {
    steamid: string;
    name: string;
    team_first_half: Side | null;
    team_final: Side | null;
    kills: number;
    deaths: number;
    assists: number;
    hs_kills: number;
    damage: number;
    first_kills: number;
    first_deaths: number;
    kast: number | null;
    rating: number | null;
    team_ids: Set<number>;
  }>();

  const ensurePlayer = (steamid: string, name: string) => {
    const existing = playersBySteamid.get(steamid);
    if (existing) {
      if (name && existing.name === "unknown") existing.name = name;
      return existing;
    }
    const created = {
      steamid,
      name: name || "unknown",
      team_first_half: null as Side | null,
      team_final: null as Side | null,
      kills: 0,
      deaths: 0,
      assists: 0,
      hs_kills: 0,
      damage: 0,
      first_kills: 0,
      first_deaths: 0,
      kast: null as number | null,
      rating: null as number | null,
      team_ids: new Set<number>(),
    };
    playersBySteamid.set(steamid, created);
    return created;
  };

  const normalizeSide = (input: string | undefined): Side | null => {
    const s = String(input ?? "").toUpperCase();
    if (s === "CT") return "CT";
    if (s === "T" || s === "TERRORIST") return "TERRORIST";
    return null;
  };

  const rounds: RawParsedDemo["rounds"] = [];
  const damageEvents: Array<{ attacker: string; victim: string; damage: number }> = [];

  for (let i = 0; i < map.round_count; i += 1) {
    const roundNumber = i + 1;
    const summary = map.rounds.find((r) => Number(r.round_num) === roundNumber);
    const payload = roundPayloads[i] ?? {};

    for (const p of payload.players ?? []) {
      const sid = String(p.steamid ?? "");
      if (!STEAM64_RE.test(sid)) continue;
      const player = ensurePlayer(sid, String(p.player_name ?? ""));
      const side = normalizeSide(p.side);
      if (side && roundNumber <= 12 && player.team_first_half == null) player.team_first_half = side;
      if (side) player.team_final = side;
      if (Number.isFinite(Number(p.team_id))) player.team_ids.add(Number(p.team_id));
    }

    const kills = (payload.kills ?? []).map((k, idx) => {
      const attacker = String(k.attacker_steamid ?? "");
      const victim = String(k.victim_steamid ?? "");
      if (STEAM64_RE.test(attacker)) ensurePlayer(attacker, "unknown");
      if (STEAM64_RE.test(victim)) ensurePlayer(victim, "unknown");
      return {
        attacker: STEAM64_RE.test(attacker) ? attacker : "",
        victim: STEAM64_RE.test(victim) ? victim : "",
        assister: null,
        weapon: String(k.weapon ?? ""),
        headshot: Boolean(k.headshot),
        is_opening: idx === 0,
        tick: Number(k.tick ?? 0),
      };
    });

    for (const d of payload.damages ?? []) {
      const attacker = String(d.attacker_steamid ?? "");
      const victim = String(d.victim_steamid ?? "");
      if (!STEAM64_RE.test(attacker) || !STEAM64_RE.test(victim)) continue;
      if (attacker === victim) continue;
      damageEvents.push({
        attacker,
        victim,
        damage: Math.min(100, Math.max(0, Number(d.dmg_health ?? 0))),
      });
    }

    const winnerRaw = payload.round_info?.winner ?? summary?.winner ?? "CT";
    const winner_side: Side = winnerRaw === "T" ? "TERRORIST" : "CT";
    const reason = String(payload.round_info?.reason ?? summary?.reason ?? "");
    const end_reason = mapRoundReason(reason, winner_side);

    rounds.push({
      round_number: roundNumber,
      winner_side,
      end_reason,
      is_pistol: roundNumber === 1 || roundNumber === 13,
      kills,
    });
  }

  for (const round of rounds) {
    for (const kill of round.kills) {
      const attacker = kill.attacker ? playersBySteamid.get(kill.attacker) : undefined;
      const victim = kill.victim ? playersBySteamid.get(kill.victim) : undefined;
      if (attacker && attacker.steamid !== victim?.steamid) {
        attacker.kills += 1;
        if (kill.headshot) attacker.hs_kills += 1;
        if (kill.is_opening) attacker.first_kills += 1;
      }
      if (victim) {
        victim.deaths += 1;
        if (kill.is_opening) victim.first_deaths += 1;
      }
    }
  }
  for (const d of damageEvents) {
    const attacker = playersBySteamid.get(d.attacker);
    if (attacker) attacker.damage += d.damage;
  }

  const totalRounds = rounds.length;
  const playerRoundFlags = new Map<string, Array<{ kill: boolean; assist: boolean; died: boolean }>>();
  for (const p of playersBySteamid.values()) {
    playerRoundFlags.set(p.steamid, Array.from({ length: totalRounds }, () => ({ kill: false, assist: false, died: false })));
  }
  for (const r of rounds) {
    const idx = r.round_number - 1;
    for (const k of r.kills) {
      const a = playerRoundFlags.get(k.attacker)?.[idx];
      if (a) a.kill = true;
      const v = playerRoundFlags.get(k.victim)?.[idx];
      if (v) v.died = true;
    }
  }
  for (const p of playersBySteamid.values()) {
    const roundsForRates = Math.max(1, totalRounds);
    const flags = playerRoundFlags.get(p.steamid) ?? [];
    const kastRounds = flags.filter((f) => f.kill || f.assist || !f.died).length;
    const kpr = p.kills / roundsForRates;
    const apr = p.assists / roundsForRates;
    const dpr = p.deaths / roundsForRates;
    const adr = p.damage / roundsForRates;
    const survival = 1 - dpr;
    const impact = 2.13 * kpr + 0.42 * apr - 0.41;
    p.kast = totalRounds > 0 ? +((kastRounds / roundsForRates) * 100).toFixed(1) : null;
    p.rating = totalRounds > 0
      ? +(((kpr / 0.679) + (survival / 0.317) + (impact / 1.277) + (adr / 79)) / 4).toFixed(2)
      : null;
  }

  const score = rounds.reduce((acc, round) => {
    if (round.winner_side === "CT") acc.ct += 1;
    else acc.t += 1;
    return acc;
  }, { ct: 0, t: 0 });

  const teamIdToSteamids = new Map<number, Set<string>>();
  for (const p of playersBySteamid.values()) {
    for (const teamId of p.team_ids) {
      if (!teamIdToSteamids.has(teamId)) teamIdToSteamids.set(teamId, new Set());
      teamIdToSteamids.get(teamId)!.add(p.steamid);
    }
  }
  const detectOurTeamId = () => {
    let bestTeamId: number | null = null;
    let bestMatches = 0;
    for (const [teamId, steamids] of teamIdToSteamids) {
      const matches = [...steamids].filter((sid) => TACTICAL_CHAOS_STEAM_IDS.has(sid)).length;
      if (matches > bestMatches) {
        bestMatches = matches;
        bestTeamId = teamId;
      }
    }
    return bestTeamId;
  };
  const ourTeamId = detectOurTeamId();
  const rivalHint = resolveRivalHint(matchInfo, ourTeamId);
  const normalizedMap = normalizeMapNameForImport(map.map_name);

  onProgress?.(94, "Consolidando JSON normalizado");
  onLog?.("cs2cam", "parsed", {
    matchId,
    mapNumber,
    map: normalizedMap,
    rounds: totalRounds,
    score,
    players: playersBySteamid.size,
    rivalHint,
  });

  const parsed: RawParsedDemo = {
    map: normalizedMap,
    server_name: "cs2.cam",
    demo_version: "cs2cam-import-v1",
    total_rounds: totalRounds,
    score,
    final_score: score,
    rounds,
    players: [...playersBySteamid.values()].map((p, idx) => ({
      steamid: p.steamid,
      userid: idx + 1,
      name: p.name,
      team_first_half: p.team_first_half,
      team_final: p.team_final,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      hs_kills: p.hs_kills,
      damage: p.damage,
      first_kills: p.first_kills,
      first_deaths: p.first_deaths,
      kast: p.kast,
      rating: p.rating,
    })),
    duration_ticks: 0,
    round_economies: rounds.map(() => ({ team_ct_avg_equip: 0, team_t_avg_equip: 0 })),
    debug: {
      score: {
        source: "round_winners_fallback",
        from_team_entities: { ct: 0, t: 0 },
        from_team_score_events: { ct: 0, t: 0 },
        from_round_winners: score,
        authoritative: score,
      },
      rounds: {
        captured: totalRounds,
        official_total: totalRounds,
        deduped_round_numbers: totalRounds,
        missed_round_end_events: 0,
      },
      players: {
        total_seen: playersBySteamid.size,
        active_kept: playersBySteamid.size,
        dropped_coaches: [],
        slot_mappings: 0,
        kills_with_missing_identity: rounds.reduce((sum, r) => sum + r.kills.filter((k) => !k.attacker || !k.victim).length, 0),
      },
      parser: {
        total_event_types: 0,
        top_events: {},
        game_rules_fields_seen: [],
        team_fields_seen: [],
        equipment_fields_seen: [],
      },
    },
  };

  onProgress?.(100, "Import listo desde cs2.cam");
  return {
    parsed,
    hints: {
      map: normalizedMap,
      rival: rivalHint,
      matchId,
      mapNumber,
    },
  };
}

function mapRoundReason(reason: string, winner: Side): string {
  switch (reason) {
    case "bomb_exploded": return "target_bombed";
    case "bomb_defused": return "bomb_defused";
    case "ct_killed": return "ct_elimination";
    case "t_killed": return "t_elimination";
    case "time_expired": return "round_time_expired";
    default: return winner === "CT" ? "t_elimination" : "ct_elimination";
  }
}

function normalizeMapNameForImport(mapName: string): string {
  const raw = String(mapName ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("de_")) return raw;
  if (raw.startsWith("cs_")) return raw;
  return `de_${raw}`;
}

function resolveRivalHint(matchInfo: Cs2CamMatchInfoResponse, ourTeamId: number | null): string {
  const m = matchInfo.match_info;
  if (!m) return "Sin definir";
  if (ourTeamId != null) {
    if (Number(m.team1_id) === ourTeamId) return String(m.team2_name ?? "Sin definir");
    if (Number(m.team2_id) === ourTeamId) return String(m.team1_name ?? "Sin definir");
  }
  const fallback = String(m.team2_name ?? m.team1_name ?? "Sin definir");
  return fallback.trim() || "Sin definir";
}
