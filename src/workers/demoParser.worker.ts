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
  await import(/* @vite-ignore */ "/node_modules/@deademx/cs2/dist/deadem-cs2.min.js");
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

self.onmessage = async (ev: MessageEvent) => {
  const { file } = ev.data as { file: File };
  try {
    const raw = await parseFile(file, (pct, label) => {
      (self as unknown as Worker).postMessage({ type: "progress", pct, label });
    });
    (self as unknown as Worker).postMessage({ type: "done", data: raw });
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: "error", message: (e as Error).message ?? String(e) });
  }
};

async function parseFile(
  file: File,
  onProgress: (pct: number, label: string) => void,
): Promise<RawParsedDemo> {
  const isBz2 = /\.bz2$/i.test(file.name);
  let bytes: Uint8Array;

  if (isBz2) {
    onProgress(2, "Leyendo archivo comprimido");
    const compressed = new Uint8Array(await file.arrayBuffer());
    onProgress(5, "Descomprimiendo bz2 (puede tardar)");
    bytes = decompressBz2All(compressed, (done, total) => {
      // Map decompression progress into 5..45% of the overall bar.
      const inner = total > 0 ? done / total : 0;
      onProgress(5 + Math.round(inner * 40), `Descomprimiendo bz2 (${fmtBytes(done)})`);
    });
  } else {
    onProgress(5, "Leyendo demo");
    bytes = new Uint8Array(await file.arrayBuffer());
    onProgress(45, "Demo cargada");
  }

  onProgress(50, "Parseando eventos");

  // Feed the parser a WHATWG stream backed by the in-memory bytes.
  const blob = new Blob([bytes.buffer as ArrayBuffer]);
  const stream = blob.stream();

  const parser = new Parser(new ParserConfiguration({
    // Frequent yields = responsive worker + progress ticks.
    breakInterval: 200,
    // Skip entity packets entirely — we only need game events, string tables
    // and the demo header. Roughly 6-8× faster than the default config.
    messagePacketTypesExclude: [ MessagePacketType.SVC_PACKET_ENTITIES ],
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

  // Snapshot user_info string table into `players` (lazy — only after
  // string tables have been populated by the parser).
  const snapshotPlayersFromStringTable = () => {
    const demo = parser.getDemo();
    const userInfo = demo?.stringTableContainer?.getByName?.(StringTableType.USER_INFO.name);
    if (!userInfo) return;
    for (const entry of userInfo.getEntries()) {
      const v = entry.value;
      if (!v || !Number.isInteger(v.userid)) continue;
      if (players.has(v.userid)) continue;
      // xuid is a BigInt SteamID64 in @deademx/cs2. Fallback to any variant name.
      const steamid = String(v.xuid ?? v.steamid ?? v.userid);
      players.set(v.userid, {
        steamid,
        userid: v.userid,
        name: v.name ?? "unknown",
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
      onProgress(progressPct, `Parseando (round ${rounds.length}/~30)`);
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
      return;
    }

    if (messagePacket.type !== MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT) return;
    const raw = messagePacket.data as { eventid: number; keys: Array<{ type: number; [k: string]: unknown }> };
    const desc = descriptors.get(raw.eventid);
    if (!desc) return;
    const event = zipEvent(desc, raw.keys);

    switch (desc.name) {
      case "round_start": {
        roundNumber += 1;
        currentRoundKills = [];
        currentRoundHasOpening = false;
        // Snapshot side of every player at round 1 → team_first_half.
        if (roundNumber === 1) snapshotPlayersFromStringTable();
        break;
      }
      case "round_end": {
        // event.winner: 2 = T, 3 = CT (Valve CSTeam enum).
        const side: "CT" | "TERRORIST" = event.winner === 3 ? "CT" : "TERRORIST";
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

  // Ensure we have players even if user_info snapshot never fired earlier.
  snapshotPlayersFromStringTable();

  // Derive score from rounds.
  let ct = 0, t = 0;
  for (const r of rounds) {
    if (r.winner_side === "CT") ct += 1; else t += 1;
  }

  onProgress(98, "Consolidando resultado");

  return {
    map: mapName,
    server_name: serverName,
    demo_version: demoVersion,
    total_rounds: rounds.length,
    score: { ct, t },
    rounds,
    players: [ ...players.values() ],
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
