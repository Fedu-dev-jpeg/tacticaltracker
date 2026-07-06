/// <reference lib="webworker" />
// Web Worker: parses a CS2 .dem or .dem.bz2 file end-to-end.
//   1) If .bz2 → decompress with seek-bzip (in this worker, keeps the main
//      thread responsive even for 1 GB streams).
//   2) Parse with @deademx/cs2, capturing map / round winners / kill events /
//      damage / etc. via interceptors.
//   3) Post back a raw parsed payload that the edge function turns into
//      DemoData v2.
//
// Messages:
//   incoming: { file: File }
//   outgoing: { type: "progress"; pct: number; label: string }
//             { type: "done"; data: RawParsedDemo }
//             { type: "error"; message: string }

// seek-bzip is a Node port that calls `new Buffer(...)` internally. Browsers
// have no `Buffer` global, so we polyfill it BEFORE importing seek-bzip.
import { Buffer as BufferPolyfill } from "buffer";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).Buffer = (self as any).Buffer || BufferPolyfill;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — seek-bzip has no types
import Bunzip from "seek-bzip";

// @deademx/cs2 is loaded from its prebuilt UMD bundle. Its ESM entry drags in
// `?worker&inline` imports (Vite-only syntax) and a bunch of CJS deps that
// esbuild's optimizer can't handle, so the module-graph route crashes the
// worker with a bare "error" event. The UMD (dist/deadem-cs2.min.js) is
// self-contained — it registers itself as `self.deademCs2`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeademCs2Api = any;
let deademCs2: DeademCs2Api | null = null;
async function loadDeadem(): Promise<DeademCs2Api> {
  if (deademCs2) return deademCs2;
  // The UMD bundle is copied to public/. Do not use dynamic import here:
  // Lovable/Vite rewrites public asset imports to `?import`, but this file is
  // not an ESM module. Load it as a script payload and execute it in the worker
  // global so it registers `self.deademCs2`.
  const umdUrl = new URL("/deadem-cs2.min.js", self.location.origin).toString();
  const response = await fetch(umdUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar deadem UMD (${response.status} ${response.statusText}) desde ${umdUrl}`);
  }
  const source = await response.text();
  const runUmd = new Function("globalThis", "self", `${source}\n//# sourceURL=${umdUrl}`);
  runUmd(self, self);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (self as any).deademCs2;
  if (!api) throw new Error("deadem UMD no expuso `deademCs2` en el worker global");
  deademCs2 = api;
  return api;
}

export interface RawParsedRound {
  round_number: number;
  winner_side: "CT" | "TERRORIST";
  end_reason: string; // raw round_end reason id → mapped below
  is_pistol: boolean;
  economy?: {
    CT: RawParsedEconomySide;
    TERRORIST: RawParsedEconomySide;
  };
  kills: Array<{
    attacker: string;
    victim: string;
    assister: string | null;
    weapon: string;
    headshot: boolean;
    is_opening: boolean;
    tick: number;
  }>;
}

export interface RawParsedEconomySide {
  avg_equip: number;
  buy_type: "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol";
}

export interface RawParsedPlayer {
  steamid: string;         // "76561198…" — SteamID64 as string
  userid: number;          // internal demo userid (transient)
  name: string;
  team_first_half: "CT" | "TERRORIST" | null;
  team_final: "CT" | "TERRORIST" | null;
  kills: number;
  deaths: number;
  assists: number;
  hs_kills: number;
  damage: number;          // total damage dealt to enemies (clamped 0..100 per hit)
  first_kills: number;
  first_deaths: number;
  kast: number | null;
  rating: number | null;
}

export interface RawParsedDemo {
  map: string;             // e.g. "de_ancient"
  server_name: string;
  demo_version: string;
  total_rounds: number;
  score: { ct: number; t: number };      // final CT vs T rounds
  final_score: { ct: number; t: number } | null;
  rounds: RawParsedRound[];
  players: RawParsedPlayer[];
  duration_ticks: number;
  round_economies: Array<{ team_ct_avg_equip: number; team_t_avg_equip: number }>;
}

// CS:GO/CS2 round_end reasons (subset we care about).
const ROUND_END_REASON: Record<number, string> = {
  1: "target_bombed",
  7: "bomb_defused",
  8: "ct_elimination",
  9: "t_elimination",
  10: "round_time_expired",
  11: "target_saved",
  12: "target_saved",
};

export type ParserStage = "read" | "bz2" | "parse" | "finalize";

function post(msg: unknown) { (self as unknown as Worker).postMessage(msg); }
function wlog(scope: string, event: string, data?: unknown, level: "info" | "warn" | "error" | "debug" = "info") {
  post({ type: "log", scope, event, level, data });
}

self.onmessage = async (ev: MessageEvent) => {
  const { file } = ev.data as { file: File };
  try {
    wlog("worker", "start", { name: file.name, size: file.size, type: file.type });
    const raw = await parseFile(file, (pct, label, stage) => {
      post({ type: "progress", pct, label, stage });
    });
    wlog("worker", "done", {
      map: raw.map,
      total_rounds: raw.total_rounds,
      score: raw.score,
      players: raw.players.length,
      rounds: raw.rounds.length,
      duration_ticks: raw.duration_ticks,
    });
    post({ type: "done", data: raw });
  } catch (e) {
    wlog("worker", "error", { message: (e as Error).message, stack: (e as Error).stack }, "error");
    post({ type: "error", message: (e as Error).message ?? String(e) });
  }
};

async function parseFile(
  file: File,
  onProgress: (pct: number, label: string, stage: ParserStage) => void,
): Promise<RawParsedDemo> {
  const isBz2 = /\.bz2$/i.test(file.name);
  let bytes: Uint8Array;

  const tReadStart = performance.now();
  if (isBz2) {
    wlog("worker:read", "reading-bz2-file", { size: file.size });
    onProgress(2, "Leyendo archivo comprimido", "read");
    const compressed = new Uint8Array(await file.arrayBuffer());
    wlog("worker:read", "bz2-loaded", { compressed_bytes: compressed.length, elapsed_ms: Math.round(performance.now() - tReadStart) });
    const tBz2 = performance.now();
    onProgress(5, "Descomprimiendo bz2 (puede tardar)", "bz2");
    bytes = decompressBz2All(compressed, (done, total) => {
      const inner = total > 0 ? done / total : 0;
      onProgress(5 + Math.round(inner * 40), `Descomprimiendo bz2 (${fmtBytes(done)})`, "bz2");
    });
    wlog("worker:bz2", "decompressed", {
      compressed_bytes: compressed.length,
      uncompressed_bytes: bytes.length,
      ratio: +(bytes.length / Math.max(1, compressed.length)).toFixed(2),
      elapsed_ms: Math.round(performance.now() - tBz2),
    });
  } else {
    wlog("worker:read", "reading-raw-demo", { size: file.size });
    onProgress(5, "Leyendo demo", "read");
    bytes = new Uint8Array(await file.arrayBuffer());
    wlog("worker:read", "raw-loaded", { bytes: bytes.length, elapsed_ms: Math.round(performance.now() - tReadStart) });
    onProgress(45, "Demo cargada", "read");
  }

  onProgress(50, "Parseando eventos", "parse");
  wlog("worker:parse", "loading-deadem-umd");

  // Load the deadem UMD lazily so any load error is reported through the
  // normal message channel instead of a bare worker `error` event.
  const { Parser, ParserConfiguration, InterceptorStage, MessagePacketType, StringTableType, DemoPacketType, EntityOperation } = await loadDeadem();

  // Feed the parser a WHATWG stream backed by the in-memory bytes.
  const blob = new Blob([bytes.buffer as ArrayBuffer]);
  const stream = blob.stream();

  const parser = new Parser(new ParserConfiguration({
    breakInterval: 500,
    // Round state comes from CCSGameRulesProxy, the final score from CCSTeam,
    // and economy from player controller/pawn equipment props at freeze end.
    entityClasses: [ 'CCSGameRulesProxy', 'CCSTeam', 'CCSPlayerController', 'CCSPlayerPawn' ],
  }));

  // ── State collected during parsing ─────────────────────────────────────
  const descriptors = new Map<number, { name: string; keys: Array<{ name: string; type: number }> }>();
  const players = new Map<number, RawParsedPlayer>();
  const rounds: RawParsedRound[] = [];
  let currentRoundKills: RawParsedRound["kills"] = [];
  let currentRoundHasOpening = false;
  let roundNumber = 0;
  let mapName = "";
  let serverName = "";
  let demoVersion = "";
  let lastTick = 0;
  let progressPct = 50;
  let bytesProcessed = 0;
  const eventCounts = new Map<string, number>();
  let debugMissedRoundEnd = 0;
  let pendingWinner: number | null = null;
  let pendingReason = 0;
  let pendingTotalRoundsPlayed: number | null = null;
  const gameRulesFieldsSeen = new Set<string>();
  const teamFieldsSeen = new Set<string>();
  const equipmentFieldsSeen = new Set<string>();
  let deathsCT = 0;
  let deathsT = 0;
  let bombExploded = false;
  let bombDefused = false;
  const fallbackUsed = 0;
  // BUG 2 FIX: Track round_freeze_end to identify warmup vs real rounds.
  let firstFreezeEndTick = -1;
  let matchStarted = false;
  // BUG 2 FIX: Deduplicate round end events by tick.
  let lastRoundEndTick = -1;
  // BUG 3 FIX: Snapshot player teams at round 1 for starting side.
  let startingSideSnapshotDone = false;
  let matchEndTick: number | null = null;
  const roundNumbersSeen = new Set<number>();
  const teamEntityState = new Map<unknown, { side: "CT" | "TERRORIST" | null; score: number | null }>();
  const playerEntityState = new Map<unknown, { steamid: string | null; name: string | null; equip: number | null }>();
  const equipBySteamid = new Map<string, number>();
  const economyByRound = new Map<number, { CT: RawParsedEconomySide; TERRORIST: RawParsedEconomySide }>();
  const playersBySteamid = new Map<string, RawParsedPlayer>();
  const teamByUserid = new Map<number, number>();
  const slotToUserid = new Map<number, number>();
  const scoreFromEvents = { ct: 0, t: 0 };
  const damageEvents: Array<{ attacker: string; victim: string; damage: number }> = [];
  // Lookup victim/attacker current team from user_info string table.
  const getTeam = (userid: number): number | null => {
    const knownTeam = teamByUserid.get(userid);
    if (knownTeam === 2 || knownTeam === 3) return knownTeam;
    const demo = parser.getDemo();
    const ui = demo?.stringTableContainer?.getByName?.(StringTableType.USER_INFO.name);
    if (!ui) return null;
    for (const e of ui.getEntries()) {
      const v = e.value;
      if (v && Number(v.userid) === userid) {
        const tn = Number(v.team_number ?? v.teamnumber ?? v.team);
        if (tn === 2 || tn === 3) teamByUserid.set(userid, tn);
        return Number.isFinite(tn) ? tn : null;
      }
    }
    return null;
  };

  const sideFromTeamNum = (teamNum: number | null): "CT" | "TERRORIST" | null => {
    if (teamNum === 3) return "CT";
    if (teamNum === 2) return "TERRORIST";
    return null;
  };

  const classifyBuyType = (
    avgEquip: number,
    round: number,
  ): RawParsedEconomySide["buy_type"] => {
    if (round === 1 || round === 13) return "pistol";
    if (avgEquip < 1000) return "full_eco";
    if (avgEquip < 2500) return "eco";
    if (avgEquip < 4000) return "half_buy";
    return "full_buy";
  };

  const representativeEquip = (buyType: RawParsedEconomySide["buy_type"]): number => {
    switch (buyType) {
      case "pistol": return 800;
      case "full_eco": return 650;
      case "eco": return 1800;
      case "half_buy": return 3200;
      case "full_buy": return 5200;
    }
  };

  const estimateBuyTypeForSide = (
    side: "CT" | "TERRORIST",
    round: number,
  ): RawParsedEconomySide["buy_type"] => {
    if (round === 1 || round === 13) return "pistol";
    const previous = rounds.filter((r) => r.round_number < round && (round <= 12 ? r.round_number <= 12 : r.round_number >= 13));
    if (previous.length === 0) return "full_buy";
    const last = previous[previous.length - 1];
    const wonLast = last.winner_side === side;
    if (wonLast) return "full_buy";

    const consecutiveLosses = [...previous].reverse().findIndex((r) => r.winner_side === side);
    const lossCount = consecutiveLosses === -1 ? previous.length : consecutiveLosses;
    if (lossCount <= 1) return "eco";
    if (lossCount === 2) return "half_buy";
    return "full_buy";
  };

  const snapshotEconomy = (round: number) => {
    if (round < 1) return;
    const values: Record<"CT" | "TERRORIST", number[]> = { CT: [], TERRORIST: [] };
    for (const p of players.values()) {
      const teamNum = getTeam(p.userid);
      const side = sideFromTeamNum(teamNum);
      if (!side) continue;
      const equip = equipBySteamid.get(p.steamid);
      if (equip != null && Number.isFinite(equip) && equip >= 0) values[side].push(equip);
    }

    const economy = (["CT", "TERRORIST"] as const).reduce((acc, side) => {
      const sideValues = values[side];
      if (sideValues.length > 0) {
        const avgEquip = Math.round(sideValues.reduce((sum, value) => sum + value, 0) / sideValues.length);
        acc[side] = { avg_equip: avgEquip, buy_type: classifyBuyType(avgEquip, round) };
      } else {
        const buyType = estimateBuyTypeForSide(side, round);
        acc[side] = { avg_equip: representativeEquip(buyType), buy_type: buyType };
      }
      return acc;
    }, {} as { CT: RawParsedEconomySide; TERRORIST: RawParsedEconomySide });

    economyByRound.set(round, economy);
  };

  // Snapshot user_info string table into `players` (lazy — only after
  // string tables have been populated by the parser).
  // We skip bots, GOTV/SourceTV relays and any entry without a real SteamID.
  // Coaches are filtered later (post-parse) based on zero match participation
  // because user_info alone doesn't distinguish them from active players.
  const snapshotPlayersFromStringTable = () => {
    const demo = parser.getDemo();
    const userInfo = demo?.stringTableContainer?.getByName?.(StringTableType.USER_INFO.name);
    if (!userInfo) return;
    for (const entry of userInfo.getEntries()) {
      const v = entry.value;
      if (!v || !Number.isInteger(v.userid)) continue;
      const slot = Number(v.playerslot ?? v.player_slot ?? v.slot ?? NaN);
      if (Number.isFinite(slot)) slotToUserid.set(slot, v.userid);
      // Reject fake players (bots) and any HLTV/SourceTV relay slot.
      if (v.fakeplayer === true || v.ishltv === true || v.is_hltv === true) continue;
      const name: string = v.name ?? "";
      if (/^(gotv|sourcetv|hltv)\b/i.test(name.trim())) continue;

      // xuid is a BigInt SteamID64 in @deademx/cs2. Fallback to any variant name.
      const xuidStr = v.xuid != null ? String(v.xuid) : "";
      const steamid = xuidStr || String(v.steamid ?? v.userid);
      // Real SteamID64 starts with 76561; reject slots that don't have one.
      if (!/^7656119\d{10}$/.test(steamid)) continue;

      const existing = players.get(v.userid) ?? playersBySteamid.get(steamid);
      if (existing) {
        existing.name = name || existing.name;
        existing.userid = v.userid;
        players.set(v.userid, existing);
        playersBySteamid.set(steamid, existing);
        continue;
      }

      const player = {
        steamid,
        userid: v.userid,
        name: name || "unknown",
        team_first_half: null,
        team_final: null,
        kills: 0, deaths: 0, assists: 0, hs_kills: 0, damage: 0,
        first_kills: 0, first_deaths: 0,
        kast: null, rating: null,
      };
      players.set(v.userid, {
        ...player,
      });
      playersBySteamid.set(steamid, players.get(v.userid)!);
    }
  };

  const resolvePlayer = (event: Record<string, unknown>, keys: string[]): RawParsedPlayer | undefined => {
    for (const key of keys) {
      const value = event[key];
      if (value == null) continue;
      if (Number(value) === 65535) continue;
      const asString = String(value);
      if (/^7656119\d{10}$/.test(asString)) {
        const bySteam = playersBySteamid.get(asString);
        if (bySteam) return bySteam;
      }
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        const byUserid = players.get(asNumber);
        if (byUserid) return byUserid;
        const mappedUserid = slotToUserid.get(asNumber);
        if (mappedUserid != null) {
          const bySlot = players.get(mappedUserid);
          if (bySlot) return bySlot;
        }
      }
    }
    return undefined;
  };

  const eventIdentity = (event: Record<string, unknown>, keys: string[]): string => {
    for (const key of keys) {
      const value = event[key];
      if (value != null) return String(value);
    }
    return "";
  };

  parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, (demoPacket: {
    tick?: number; type?: { code?: number }; data?: { mapName?: string; serverName?: string; demoVersionName?: string };
  }) => {
    if (typeof demoPacket.tick === "number") lastTick = demoPacket.tick;
    if (demoPacket.type === DemoPacketType.DEM_FILE_HEADER && demoPacket.data) {
      mapName = demoPacket.data.mapName ?? "";
      serverName = demoPacket.data.serverName ?? "";
      demoVersion = demoPacket.data.demoVersionName ?? "";
    }
    if (players.size === 0) snapshotPlayersFromStringTable();

    // Very coarse progress: after decompression we're at 50%, scale the last
    // 45% by parser progress (using ticks or byte position where available).
    bytesProcessed += 1;
    if (bytesProcessed % 500 === 0) {
      // Ticks-per-round in CS2 ~ 1900. Rough estimate; capped at 95%.
      progressPct = Math.min(95, 50 + Math.round((rounds.length / 30) * 45));
      onProgress(progressPct, `Parseando (round ${rounds.length}/~30)`, "parse");
    }
  });

  parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (
    _demoPacket: { tick?: number },
    messagePacket: { type: unknown; data: unknown },
  ) => {
    // 1) Learn game event descriptors so we can zip their keys later.
    if (messagePacket.type === MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT_LIST) {
      const data = messagePacket.data as { descriptors: Array<{ eventid: number; name: string; keys: Array<{ name: string; type: number }> }> };
      for (const d of data.descriptors) descriptors.set(d.eventid, d);
      // Emit the discovered event catalog so we can see what @deademx exposes
      // for this demo (round_end / cs_win_panel_round / etc. names differ
      // between CS2 patches). Truncated to first 60 for log readability.
      const names = data.descriptors.map((d) => d.name);
      wlog("worker:parse", "descriptors-loaded", {
        total: names.length,
        has_round_end: names.includes("round_end"),
        has_round_officially_ended: names.includes("round_officially_ended"),
        has_cs_win_panel_round: names.includes("cs_win_panel_round"),
        has_player_death: names.includes("player_death"),
        has_player_hurt: names.includes("player_hurt"),
        round_like: names.filter((n) => /round|win_panel|match_end|scoreboard/i.test(n)),
        sample: names.slice(0, 60),
      });
      return;
    }

    if (messagePacket.type !== MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT) return;
    const raw = messagePacket.data as { eventid: number; keys: Array<{ type: number; [k: string]: unknown }> };
    const desc = descriptors.get(raw.eventid);
    if (!desc) return;
    const event = zipEvent(desc, raw.keys);

    // Debug: tally every event name we see so we can diagnose missing scores.
    eventCounts.set(desc.name, (eventCounts.get(desc.name) ?? 0) + 1);

    switch (desc.name) {
      case "round_freeze_end": {
        if (matchEndTick != null) break;
        // BUG 2 FIX: Track the first freeze_end to distinguish warmup from real rounds.
        if (firstFreezeEndTick < 0) {
          firstFreezeEndTick = lastTick;
          matchStarted = true;
          wlog("worker:parse", "match-started", { first_freeze_end_tick: firstFreezeEndTick });
        }
        snapshotPlayersFromStringTable();
        snapshotEconomy(economyByRound.size + 1);
        // BUG 3 FIX: On the first real round, snapshot player team assignments.
        if (!startingSideSnapshotDone && matchStarted) {
          startingSideSnapshotDone = true;
          const demo = parser.getDemo();
          const ui = demo?.stringTableContainer?.getByName?.(StringTableType.USER_INFO.name);
          if (ui) {
            for (const entry of ui.getEntries()) {
              const v = entry.value;
              if (!v || !Number.isInteger(v.userid)) continue;
              const p = players.get(v.userid);
              if (!p) continue;
              const tn = getTeam(v.userid);
              if (tn === 2) p.team_first_half = "TERRORIST";
              else if (tn === 3) p.team_first_half = "CT";
            }
          }
          wlog("worker:parse", "starting-side-snapshot", {
            players: [...players.values()].map((p) => ({ name: p.name, side: p.team_first_half })),
          });
        }
        break;
      }
      case "round_start": {
        roundNumber += 1;
        currentRoundKills = [];
        currentRoundHasOpening = false;
        deathsCT = 0;
        deathsT = 0;
        bombExploded = false;
        bombDefused = false;
        if (roundNumber === 1) snapshotPlayersFromStringTable();
        break;
      }
      case "player_team":
      case "local_player_team":
      case "local_player_controller_team": {
        const userid = Number(event.userid ?? event.user_id ?? event.player ?? NaN);
        const team = Number(event.team ?? event.team_number ?? event.teamnumber ?? NaN);
        if (Number.isFinite(userid) && (team === 2 || team === 3)) teamByUserid.set(userid, team);
        break;
      }
      case "team_score": {
        const team = Number(event.teamid ?? event.team ?? event.team_number ?? event.teamnumber ?? NaN);
        const scoreValue = Number(event.score ?? event.team_score ?? event.teamscore ?? NaN);
        if (Number.isFinite(scoreValue)) {
          if (team === 3) scoreFromEvents.ct = Math.max(scoreFromEvents.ct, scoreValue);
          if (team === 2) scoreFromEvents.t = Math.max(scoreFromEvents.t, scoreValue);
        }
        break;
      }
      case "bomb_exploded": bombExploded = true; break;
      case "bomb_defused": bombDefused = true; break;
      case "cs_win_panel_match": {
        matchEndTick = lastTick;
        break;
      }
      case "round_officially_ended": {
        if (matchEndTick != null && lastTick > matchEndTick) break;
        // BUG 2 FIX: Deduplicate by tick — if two end events share the same tick, skip.
        if (lastTick === lastRoundEndTick && lastRoundEndTick > 0) break;
        // BUG 2 FIX: Discard rounds that happened before the first freeze_end (warmup/knife).
        if (!matchStarted) break;

        lastRoundEndTick = lastTick;
        let winnerNum = Number(event.winner ?? event.winner_team ?? event.final_event ?? NaN);
        if (winnerNum !== 2 && winnerNum !== 3 && pendingWinner != null) winnerNum = pendingWinner;
        if (winnerNum !== 2 && winnerNum !== 3) {
          debugMissedRoundEnd += 1;
          pendingWinner = null;
          pendingReason = 0;
          break;
        }
        const side: "CT" | "TERRORIST" = winnerNum === 3 ? "CT" : "TERRORIST";
        const reasonNum = Number(event.reason ?? pendingReason ?? 0);
        const officialRoundNumber = pendingTotalRoundsPlayed && pendingTotalRoundsPlayed > 0
          ? pendingTotalRoundsPlayed
          : rounds.length + 1;
        if (roundNumbersSeen.has(officialRoundNumber)) break;
        roundNumbersSeen.add(officialRoundNumber);
        rounds.push({
          round_number: officialRoundNumber,
          winner_side: side,
          end_reason: ROUND_END_REASON[reasonNum] ?? (side === "CT" ? "ct_elimination" : "t_elimination"),
          is_pistol: officialRoundNumber === 1 || officialRoundNumber === 13,
          economy: economyByRound.get(officialRoundNumber),
          kills: currentRoundKills,
        });
        pendingTotalRoundsPlayed = null;
        currentRoundKills = [];
        currentRoundHasOpening = false;
        pendingWinner = null;
        pendingReason = 0;
        deathsCT = 0;
        deathsT = 0;
        bombExploded = false;
        bombDefused = false;
        break;
      }
      case "round_end":
      case "cs_win_panel_round": {
        if (matchEndTick != null && lastTick > matchEndTick) break;
        break;
      }
      case "player_death": {
        const attacker = resolvePlayer(event, ["attacker", "attacker_steamid", "attacker_xuid"]);
        const victim = resolvePlayer(event, ["userid", "victim", "victim_steamid", "victim_xuid"]);
        const assister = resolvePlayer(event, ["assister", "assister_steamid", "assister_xuid"]);
        const attackerId = eventIdentity(event, ["attacker", "attacker_steamid", "attacker_xuid"]);
        const victimId = eventIdentity(event, ["userid", "victim", "victim_steamid", "victim_xuid"]);
        const assisterId = eventIdentity(event, ["assister", "assister_steamid", "assister_xuid"]);
        const isSelf = attackerId !== "" && attackerId === victimId;
        const isOpening = !currentRoundHasOpening;
        if (attacker && !isSelf) {
          attacker.kills += 1;
          if (event.headshot) attacker.hs_kills += 1;
          if (isOpening) attacker.first_kills += 1;
        }
        if (victim) {
          victim.deaths += 1;
          if (isOpening) victim.first_deaths += 1;
        }
        if (assister && assisterId !== "" && assisterId !== victimId && assisterId !== attackerId) {
          assister.assists += 1;
        }
        // Tally victim's side for fallback winner deduction.
        const vTeam = victim ? getTeam(victim.userid) : getTeam(Number(event.userid));
        if (vTeam === 3) deathsCT += 1;
        else if (vTeam === 2) deathsT += 1;
        currentRoundHasOpening = true;
        currentRoundKills.push({
          attacker: attacker?.steamid ?? "",
          victim: victim?.steamid ?? "",
          assister: assister?.steamid ?? null,
          weapon: String(event.weapon ?? ""),
          headshot: !!event.headshot,
          is_opening: isOpening,
          tick: lastTick,
        });
        break;
      }
      case "player_hurt": {
        const attacker = resolvePlayer(event, ["attacker", "attacker_steamid", "attacker_xuid"]);
        const victim = resolvePlayer(event, ["userid", "victim", "victim_steamid", "victim_xuid"]);
        const dmg = Number(event.dmg_health ?? 0);
        if (attacker && (!victim || attacker.steamid !== victim.steamid)) {
          damageEvents.push({
            attacker: attacker.steamid,
            victim: victim?.steamid ?? "",
            damage: Math.min(100, Math.max(0, dmg)),
          });
        }
        break;
      }
    }
  });

  // CS2 game events do NOT include the round winner. Track it from
  // CCSGameRulesProxy entity mutations: m_iRoundEndWinnerTeam (2=T, 3=CT)
  // and m_eRoundEndReason. The values are set slightly before the
  // round_officially_ended game event, so pending values are ready to consume.
  parser.registerPostInterceptor(InterceptorStage.ENTITY_PACKET, (
    _dp: unknown,
    _mp: unknown,
    events: Array<{ operation: unknown; entity: { class?: { name?: string }; [k: string]: unknown }; getChanges: () => Record<string, unknown> }>,
  ) => {
    for (const ev of events) {
      if (ev.operation !== EntityOperation.UPDATE && ev.operation !== EntityOperation.CREATE) continue;
      const className = ev.entity?.class?.name ?? "";
      const changes = ev.getChanges();
      if (className === 'CCSGameRulesProxy') {
        for (const k of Object.keys(changes)) gameRulesFieldsSeen.add(k);
        // Field names differ by CS2 build — match any key containing the substring.
        let w: unknown, r: unknown, total: unknown;
        for (const [k, v] of Object.entries(changes)) {
          if (w === undefined && /RoundEndWinnerTeam|m_iRoundWinner\b/i.test(k)) w = v;
          if (r === undefined && /RoundEndReason/i.test(k)) r = v;
          if (total === undefined && /totalRoundsPlayed/i.test(k)) total = v;
        }
        if (w !== undefined && w !== null) {
          const n = Number(w);
          if (n === 2 || n === 3) pendingWinner = n;
          else pendingWinner = null;
        }
        if (r !== undefined && r !== null) pendingReason = Number(r);
        if (total !== undefined && total !== null) {
          const n = Number(total);
          if (Number.isFinite(n) && n > 0) pendingTotalRoundsPlayed = n;
        }
      } else if (className === 'CCSTeam') {
        for (const k of Object.keys(changes)) teamFieldsSeen.add(k);
        const state = teamEntityState.get(ev.entity) ?? { side: null, score: null };
        for (const [k, v] of Object.entries(changes)) {
          if (/Teamname|m_szTeamname/i.test(k)) {
            const teamName = String(v ?? "").toUpperCase();
            if (teamName === "CT") state.side = "CT";
            else if (teamName === "TERRORIST" || teamName === "T") state.side = "TERRORIST";
          }
          if (/m_iScore|\bscore\b/i.test(k)) {
            const score = Number(v);
            if (Number.isFinite(score)) state.score = score;
          }
          if (/m_iTeamNum|team_number|teamnumber/i.test(k)) {
            const side = sideFromTeamNum(Number(v));
            if (side) state.side = side;
          }
        }
        teamEntityState.set(ev.entity, state);
      } else if (className === 'CCSPlayerController' || className === 'CCSPlayerPawn') {
        const state = playerEntityState.get(ev.entity) ?? { steamid: null, name: null, equip: null };
        for (const [k, v] of Object.entries(changes)) {
          if (/current_equip_value|CurrentEquipmentValue|unCurrentEquipmentValue|equipment.*value/i.test(k)) {
            equipmentFieldsSeen.add(k);
            const equip = Number(v);
            if (Number.isFinite(equip)) state.equip = equip;
          }
          if (/m_iszPlayerName|player.?name|m_szName|\bname\b/i.test(k)) {
            const name = String(v ?? "").trim();
            if (name) state.name = name;
          }
          if (/m_steamID|steamid|xuid/i.test(k)) {
            const steamid = String(v ?? "");
            if (/^7656119\d{10}$/.test(steamid)) state.steamid = steamid;
          }
        }
        playerEntityState.set(ev.entity, state);
        if (state.steamid && state.equip != null) equipBySteamid.set(state.steamid, state.equip);
      }
    }
  });

  await parser.parse(stream);
  await parser.dispose();

  const tParseEnd = performance.now();
  wlog("worker:parse", "parser-finished", {
    ticks_seen: lastTick,
    total_players_in_user_info: players.size,
    total_event_types: eventCounts.size,
    elapsed_ms_since_worker_start: Math.round(performance.now()),
  });

  // Ensure we have players even if user_info snapshot never fired earlier.
  snapshotPlayersFromStringTable();

  const finalScoreFromTeams = (() => {
    const out = { ct: 0, t: 0 };
    for (const state of teamEntityState.values()) {
      if (state.side === "CT" && state.score != null) out.ct = Math.max(out.ct, state.score);
      if (state.side === "TERRORIST" && state.score != null) out.t = Math.max(out.t, state.score);
    }
    return out;
  })();
  const finalScoreFromEvents = { ct: scoreFromEvents.ct, t: scoreFromEvents.t };

  const countedScore = rounds.reduce((acc, r) => {
    if (r.winner_side === "CT") acc.ct += 1;
    else acc.t += 1;
    return acc;
  }, { ct: 0, t: 0 });

  // The match-winning round can jump straight to cs_win_panel_match without a
  // later round_officially_ended. Add exactly that missing round from CCSTeam.
  const teamScoreTotalRounds = finalScoreFromTeams.ct + finalScoreFromTeams.t;
  const eventScoreTotalRounds = finalScoreFromEvents.ct + finalScoreFromEvents.t;
  const finalScoreAuthoritative = teamScoreTotalRounds > 0
    ? finalScoreFromTeams
    : (eventScoreTotalRounds > 0 ? finalScoreFromEvents : countedScore);
  const finalTotalRounds = finalScoreAuthoritative.ct + finalScoreAuthoritative.t;
  if (matchEndTick != null && finalTotalRounds > rounds.length) {
    const missingCt = finalScoreAuthoritative.ct - countedScore.ct;
    const missingT = finalScoreAuthoritative.t - countedScore.t;
    if (missingCt + missingT === finalTotalRounds - rounds.length && missingCt + missingT > 0) {
      const winnerSide: "CT" | "TERRORIST" = missingCt > missingT ? "CT" : "TERRORIST";
      const inferredRoundNumber = Math.max(...rounds.map((r) => r.round_number), 0) + 1;
      if (!roundNumbersSeen.has(inferredRoundNumber)) {
        rounds.push({
          round_number: inferredRoundNumber,
          winner_side: winnerSide,
          end_reason: ROUND_END_REASON[pendingReason] ?? (winnerSide === "CT" ? "ct_elimination" : "t_elimination"),
          is_pistol: inferredRoundNumber === 1 || inferredRoundNumber === 13,
          economy: economyByRound.get(inferredRoundNumber),
          kills: currentRoundKills,
        });
        roundNumbersSeen.add(inferredRoundNumber);
      }
    }
  }

  rounds.sort((a, b) => a.round_number - b.round_number);
  const score = finalScoreAuthoritative;
  const officialTotalRounds = score.ct + score.t || rounds.length;
  if (rounds.length > officialTotalRounds) rounds.splice(officialTotalRounds);

  // Post-filter: drop coaches only.
  const COACH_RE = /(^|\s|[[(._-])coach\b/i;
  const KNOWN_COACH_STEAMIDS = new Set([
    "76561199108435769",
    "76561198098107455",
  ]);
  const isCoach = (p: RawParsedPlayer) => COACH_RE.test(p.name ?? "") || KNOWN_COACH_STEAMIDS.has(p.steamid);
  for (const p of players.values()) {
    p.team_final = sideFromTeamNum(getTeam(p.userid));
  }
  const activePlayers = [...players.values()].filter((p) => !isCoach(p));
  const droppedCoaches = [...players.values()].filter(isCoach).map((p) => p.name);

  // Derive scoreboard from the normalized JSON layer (round kills + hurt events)
  // instead of trusting entity counters, which include misleading per-round fields
  // in some CS2 builds.
  for (const p of activePlayers) {
    p.kills = 0;
    p.deaths = 0;
    p.assists = 0;
    p.hs_kills = 0;
    p.damage = 0;
    p.first_kills = 0;
    p.first_deaths = 0;
  }
  const activeSteamids = new Set(activePlayers.map((p) => p.steamid));
  for (const r of rounds) {
    for (const kill of r.kills) {
      const attacker = activeSteamids.has(kill.attacker) ? playersBySteamid.get(kill.attacker) : undefined;
      const victim = activeSteamids.has(kill.victim) ? playersBySteamid.get(kill.victim) : undefined;
      const assister = kill.assister && activeSteamids.has(kill.assister) ? playersBySteamid.get(kill.assister) : undefined;
      if (attacker && attacker.steamid !== victim?.steamid) {
        attacker.kills += 1;
        if (kill.headshot) attacker.hs_kills += 1;
        if (kill.is_opening) attacker.first_kills += 1;
      }
      if (victim) {
        victim.deaths += 1;
        if (kill.is_opening) victim.first_deaths += 1;
      }
      if (assister && assister.steamid !== attacker?.steamid && assister.steamid !== victim?.steamid) {
        assister.assists += 1;
      }
    }
  }
  for (const damageEvent of damageEvents) {
    const attacker = activeSteamids.has(damageEvent.attacker) ? playersBySteamid.get(damageEvent.attacker) : undefined;
    if (attacker && damageEvent.attacker !== damageEvent.victim) attacker.damage += damageEvent.damage;
  }

  const playerRoundFlags = new Map<string, Array<{ kill: boolean; assist: boolean; died: boolean }>>();
  for (const p of activePlayers) {
    playerRoundFlags.set(p.steamid, Array.from({ length: officialTotalRounds }, () => ({ kill: false, assist: false, died: false })));
  }
  for (const r of rounds) {
    const index = r.round_number - 1;
    if (index < 0 || index >= officialTotalRounds) continue;
    for (const kill of r.kills) {
      const attackerRound = playerRoundFlags.get(kill.attacker)?.[index];
      if (attackerRound) attackerRound.kill = true;
      const assisterRound = kill.assister ? playerRoundFlags.get(kill.assister)?.[index] : null;
      if (assisterRound) assisterRound.assist = true;
      const victimRound = playerRoundFlags.get(kill.victim)?.[index];
      if (victimRound) victimRound.died = true;
    }
  }
  for (const p of activePlayers) {
    const flags = playerRoundFlags.get(p.steamid) ?? [];
    const kastRounds = flags.filter((f) => f.kill || f.assist || !f.died).length;
    const roundsForRates = Math.max(1, officialTotalRounds);
    const kpr = p.kills / roundsForRates;
    const apr = p.assists / roundsForRates;
    const dpr = p.deaths / roundsForRates;
    const adr = p.damage / roundsForRates;
    const survival = 1 - dpr;
    const impact = 2.13 * kpr + 0.42 * apr - 0.41;
    p.kast = officialTotalRounds > 0 ? +((kastRounds / roundsForRates) * 100).toFixed(1) : null;
    p.rating = officialTotalRounds > 0
      ? +(((kpr / 0.679) + (survival / 0.317) + (impact / 1.277) + (adr / 79)) / 4).toFixed(2)
      : null;
  }

  // Diagnostic log: the top event names + count of round_end packets we saw
  // but couldn't attribute a winner to. Helps triage 0-0 scores.
  const topEvents = [...eventCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  wlog("worker:parse", "event-summary", {
    map: mapName,
    server: serverName,
    demo_version: demoVersion,
    rounds_captured: rounds.length,
    score_ct_t: score,
    score_source: teamScoreTotalRounds > 0 ? "CCSTeam.m_iScore" : (eventScoreTotalRounds > 0 ? "team_score_event" : "round_winners_fallback"),
    score_from_events: finalScoreFromEvents,
    match_end_tick: matchEndTick,
    players_kept: activePlayers.length,
    players_dropped: players.size - activePlayers.length,
    dropped_coaches: droppedCoaches,
    missed_round_ends: debugMissedRoundEnd,
    fallback_winner_deductions: fallbackUsed,
    top_events: Object.fromEntries(topEvents),
    total_event_types: eventCounts.size,
    game_rules_fields_seen: [...gameRulesFieldsSeen].sort(),
    team_fields_seen: [...teamFieldsSeen].sort(),
    equipment_fields_seen: [...equipmentFieldsSeen].sort(),
    parse_ms: Math.round(tParseEnd - performance.now()) * -1,
  });
  wlog("worker:parse", "players-snapshot", activePlayers.map((p) => ({
    steamid: p.steamid, name: p.name,
    k: p.kills, d: p.deaths, a: p.assists,
    hs: p.hs_kills, dmg: p.damage,
    fk: p.first_kills, fd: p.first_deaths,
    kast: p.kast, rating: p.rating,
  })));

  onProgress(98, "Consolidando resultado", "finalize");

  return {
    map: mapName,
    server_name: serverName,
    demo_version: demoVersion,
    total_rounds: officialTotalRounds,
    score,
    final_score: officialTotalRounds > 0 ? score : null,
    rounds,
    players: activePlayers,
    duration_ticks: lastTick,
    round_economies: rounds.map((round) => ({
      team_ct_avg_equip: round.economy?.CT.avg_equip ?? 0,
      team_t_avg_equip: round.economy?.TERRORIST.avg_equip ?? 0,
    })),
  };
}

// ── seek-bzip full-file decompression with a growing chunk list ──────────
// We can't stream progress from seek-bzip mid-block (it's synchronous), but
// we can report every write() the internal decoder makes.
function decompressBz2All(
  compressed: Uint8Array,
  onProgress: (bytesOut: number, estimatedTotal: number) => void,
): Uint8Array {
  const CHUNK = 4 * 1024 * 1024; // 4 MB scratch chunks
  const chunks: Uint8Array[] = [];
  let current = new Uint8Array(CHUNK);
  let currentOffset = 0;
  let totalOut = 0;
  // Very rough: assume bz2 ratio 4x → 25% ratio. Just used for progress display.
  const estimatedTotal = compressed.length * 4;

  const flush = () => {
    if (currentOffset > 0) {
      chunks.push(current.subarray(0, currentOffset));
      current = new Uint8Array(CHUNK);
      currentOffset = 0;
    }
  };

  const sink = {
    writeByte(b: number) {
      if (currentOffset >= CHUNK) flush();
      current[currentOffset++] = b;
      totalOut += 1;
      if ((totalOut & 0x3FFFFF) === 0) onProgress(totalOut, estimatedTotal); // every ~4 MB
    },
    write(buffer: Uint8Array, offset: number, length: number): number {
      let remaining = length;
      let srcOff = offset;
      while (remaining > 0) {
        const space = CHUNK - currentOffset;
        if (space === 0) { flush(); continue; }
        const take = Math.min(space, remaining);
        current.set(buffer.subarray(srcOff, srcOff + take), currentOffset);
        currentOffset += take;
        srcOff += take;
        remaining -= take;
        totalOut += take;
      }
      onProgress(totalOut, estimatedTotal);
      return length;
    },
    flush() { /* no-op */ },
  };

  try {
    Bunzip.decode(compressed, sink);
  } catch (e) {
    if (totalOut === 0) throw new Error("bz2: " + (e as Error).message);
    // seek-bzip often throws at final block boundary — accept partial if we
    // already have gigabytes of output.
  }
  flush();

  const result = new Uint8Array(totalOut);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

// ── Utils ────────────────────────────────────────────────────────────────

interface GameEventKey { type: number; valString?: string; valFloat?: number; valLong?: number; valShort?: number; valByte?: number; valBool?: boolean; valUint64?: string | number | bigint; [k: string]: unknown }
function zipEvent(desc: { keys: Array<{ name: string; type: number }> }, keys: GameEventKey[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < desc.keys.length; i++) {
    const key = keys[i];
    if (!key) continue;
    switch (key.type) {
      case 1: out[desc.keys[i].name] = key.valString; break;
      case 2: out[desc.keys[i].name] = key.valFloat; break;
      case 3: out[desc.keys[i].name] = key.valLong; break;
      case 4: out[desc.keys[i].name] = key.valShort; break;
      case 5: out[desc.keys[i].name] = key.valByte; break;
      case 6: out[desc.keys[i].name] = key.valBool; break;
      case 7: out[desc.keys[i].name] = key.valUint64; break;
      case 8: out[desc.keys[i].name] = key.valLong; break;
      case 9: out[desc.keys[i].name] = key.valShort; break;
      default: out[desc.keys[i].name] = null;
    }
  }
  return out;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
