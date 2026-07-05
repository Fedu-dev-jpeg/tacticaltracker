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
  // Vite must not try to transform this URL — the file is a plain UMD script.
  const umdUrl = "/node_modules/@deademx/cs2/dist/deadem-cs2.min.js";
  await import(/* @vite-ignore */ umdUrl);
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

export interface RawParsedPlayer {
  steamid: string;         // "76561198…" — SteamID64 as string
  userid: number;          // internal demo userid (transient)
  name: string;
  team_first_half: "CT" | "TERRORIST" | null;
  kills: number;
  deaths: number;
  assists: number;
  hs_kills: number;
  damage: number;          // total damage dealt to enemies (clamped 0..100 per hit)
  first_kills: number;
  first_deaths: number;
}

export interface RawParsedDemo {
  map: string;             // e.g. "de_ancient"
  server_name: string;
  demo_version: string;
  total_rounds: number;
  score: { ct: number; t: number };      // final CT vs T rounds
  rounds: RawParsedRound[];
  players: RawParsedPlayer[];
  duration_ticks: number;
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
    // In CS2 the round winner and end reason live on CCSGameRulesProxy entity
    // props (m_iRoundEndWinnerTeam / m_eRoundEndReason), NOT on the game event
    // payload. Decoding just that one class keeps us fast (~4-6× vs full) while
    // preserving the data we need to score rounds.
    entityClasses: [ 'CCSGameRulesProxy' ],
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
      if (players.has(v.userid)) continue;

      // Reject fake players (bots) and any HLTV/SourceTV relay slot.
      if (v.fakeplayer === true || v.ishltv === true || v.is_hltv === true) continue;
      const name: string = v.name ?? "";
      if (/^(gotv|sourcetv|hltv)\b/i.test(name.trim())) continue;

      // xuid is a BigInt SteamID64 in @deademx/cs2. Fallback to any variant name.
      const xuidStr = v.xuid != null ? String(v.xuid) : "";
      const steamid = xuidStr || String(v.steamid ?? v.userid);
      // Real SteamID64 starts with 76561; reject slots that don't have one.
      if (!/^7656119\d{10}$/.test(steamid)) continue;

      players.set(v.userid, {
        steamid,
        userid: v.userid,
        name: name || "unknown",
        team_first_half: null,
        kills: 0, deaths: 0, assists: 0, hs_kills: 0, damage: 0,
        first_kills: 0, first_deaths: 0,
      });
    }
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
      case "round_start": {
        roundNumber += 1;
        currentRoundKills = [];
        currentRoundHasOpening = false;
        // Snapshot side of every player at round 1 → team_first_half.
        if (roundNumber === 1) snapshotPlayersFromStringTable();
        break;
      }
      case "round_end":
      case "round_officially_ended":
      case "cs_win_panel_round": {
        // `round_end` fires when the outcome is decided; `round_officially_ended`
        // fires at freeze time after; `cs_win_panel_round` shows the summary
        // panel. Some CS2 demos ship only one of these — accept whichever wins
        // first for a given round number and dedupe by round index.
        if (rounds.length >= roundNumber && roundNumber > 0) break; // already recorded
        // Valve CSTeam enum: 2 = T, 3 = CT. Some events use `final_event` /
        // `winner_team` instead of `winner`.
        const winnerRaw = event.winner ?? event.winner_team ?? event.final_event;
        const winnerNum = Number(winnerRaw);
        // If we can't tell, skip — better no round than a wrong one.
        if (winnerNum !== 2 && winnerNum !== 3) {
          debugMissedRoundEnd = (debugMissedRoundEnd ?? 0) + 1;
          break;
        }
        const side: "CT" | "TERRORIST" = winnerNum === 3 ? "CT" : "TERRORIST";
        const reasonNum = Number(event.reason ?? 0);
        rounds.push({
          round_number: rounds.length + 1,
          winner_side: side,
          end_reason: ROUND_END_REASON[reasonNum] ?? (side === "CT" ? "ct_elimination" : "t_elimination"),
          is_pistol: rounds.length === 0 || rounds.length === 12,
          kills: currentRoundKills,
        });
        currentRoundKills = [];
        currentRoundHasOpening = false;
        break;
      }
      case "player_death": {
        const attacker = players.get(Number(event.attacker));
        const victim = players.get(Number(event.userid));
        const assister = players.get(Number(event.assister));
        const isSelf = Number(event.attacker) === Number(event.userid);
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
        if (assister && Number(event.assister) !== Number(event.userid) && Number(event.assister) !== Number(event.attacker)) {
          assister.assists += 1;
        }
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
        const attacker = players.get(Number(event.attacker));
        const dmg = Number(event.dmg_health ?? 0);
        // Clamp to 100 → treat overkill same as CS2 stat pages.
        if (attacker && Number(event.attacker) !== Number(event.userid)) {
          attacker.damage += Math.min(100, Math.max(0, dmg));
        }
        break;
      }
    }
  });

  // Match end payload sometimes carries the definitive scoreboard — capture it
  // but we don't depend on it (we compute score from round_end events).
  parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, () => { /* placeholder */ });

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

  // Post-filter: drop coaches only.
  const COACH_RE = /(^|\s|[\[\(\-_.])coach\b/i;
  const activePlayers = [...players.values()].filter((p) => !COACH_RE.test(p.name ?? ""));
  const droppedCoaches = [...players.values()].filter((p) => COACH_RE.test(p.name ?? "")).map((p) => p.name);

  // Derive score from rounds.
  let ct = 0, t = 0;
  for (const r of rounds) {
    if (r.winner_side === "CT") ct += 1; else t += 1;
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
    score_ct_t: { ct, t },
    players_kept: activePlayers.length,
    players_dropped: players.size - activePlayers.length,
    dropped_coaches: droppedCoaches,
    missed_round_ends: debugMissedRoundEnd,
    top_events: Object.fromEntries(topEvents),
    total_event_types: eventCounts.size,
    parse_ms: Math.round(tParseEnd - performance.now()) * -1,
  });
  wlog("worker:parse", "players-snapshot", activePlayers.map((p) => ({
    steamid: p.steamid, name: p.name,
    k: p.kills, d: p.deaths, a: p.assists,
    hs: p.hs_kills, dmg: p.damage,
    fk: p.first_kills, fd: p.first_deaths,
  })));

  onProgress(98, "Consolidando resultado", "finalize");

  return {
    map: mapName,
    server_name: serverName,
    demo_version: demoVersion,
    total_rounds: rounds.length,
    score: { ct, t },
    rounds,
    players: activePlayers,
    duration_ticks: lastTick,
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
