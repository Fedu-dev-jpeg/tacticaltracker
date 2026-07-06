// Client-side CS2 demo (.dem / .dem.bz2) parser.
//
// Scope of THIS iteration:
//   - Detect .bz2, decompress just enough bytes to read the header (≤1 MB).
//   - Validate CS2 magic ("PBDEMS2\0").
//   - Read the first DEM_FileHeader command and extract map_name.
//
// NOT in scope yet (next iteration):
//   - Round-by-round score reconstruction (needs snappy + game event decoding).
//   - Player stats (K/D/A/ADR).
//
// Design goals:
//   - Zero WASM. Pure TS + one bz2 lib.
//   - Never hold the full uncompressed 1 GB demo in memory: bail out of bz2
//     decompression as soon as we have enough bytes for the header (~64 KB is
//     way more than enough — CDemoFileHeader is a few hundred bytes).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — seek-bzip ships no types
import Bunzip from "seek-bzip";

export interface ParsedDemoHeader {
  map: string;          // Normalized map name ("Ancient", "Nuke", …)
  rawMapName: string;   // As stored in the demo ("de_ancient", …)
  serverName: string;
  clientName: string;
  demoVersionName: string;
  buildNum: number;
  isCompressed: boolean;
  bytesRead: number;    // Bytes of the (possibly decompressed) stream we consumed
}

// Raw payload emitted by the Web Worker parser. Kept as `unknown` here to
// avoid pulling worker-only types into main-thread bundles; the shape is
// declared alongside the worker and re-validated on the edge function.
export interface RawParsedDemo {
  map: string;
  server_name: string;
  demo_version: string;
  total_rounds: number;
  score: { ct: number; t: number };
  final_score: { ct: number; t: number } | null;
  rounds: Array<{
    round_number: number;
    winner_side: "CT" | "TERRORIST";
    end_reason: string;
    is_pistol: boolean;
    economy?: {
      CT: { avg_equip: number; buy_type: "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol" };
      TERRORIST: { avg_equip: number; buy_type: "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol" };
    };
    kills: Array<{
      attacker: string; victim: string; assister: string | null;
      weapon: string; headshot: boolean; is_opening: boolean; tick: number;
    }>;
  }>;
  players: Array<{
    steamid: string; userid: number; name: string;
    team_first_half: "CT" | "TERRORIST" | null;
    team_final?: "CT" | "TERRORIST" | null;
    kills: number; deaths: number; assists: number; hs_kills: number; damage: number;
    first_kills: number; first_deaths: number;
    kast: number | null; rating: number | null;
  }>;
  duration_ticks: number;
  round_economies: Array<{ team_ct_avg_equip: number; team_t_avg_equip: number }>;
}

const MAGIC_CS2 = "PBDEMS2\0";

// DEM_* command IDs we care about (from CDemoCmd enum).
const DEM_FILE_HEADER = 1;
const CMD_COMPRESSED_MASK = 0x40;

const MAP_ALIAS: Record<string, string> = {
  de_mirage: "Mirage",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_anubis: "Anubis",
  de_ancient: "Ancient",
  de_dust2: "Dust2",
  de_vertigo: "Vertigo",
  de_overpass: "Overpass",
  de_train: "Train",
  de_cache: "Cache",
  de_office: "Office",
  de_italy: "Italy",
};

export function normalizeMapName(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (MAP_ALIAS[lower]) return MAP_ALIAS[lower];
  // Strip "de_"/"cs_" prefix and title-case as a fallback.
  const stripped = lower.replace(/^(de|cs)_/, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// ─── Full demo parser (browser Web Worker) ────────────────────────────────
// Runs the real @deademx/cs2 parser inside a Worker so the main thread stays
// responsive during bz2 decompression + event iteration on ~1 GB streams.
export type ParserStage = "read" | "bz2" | "parse" | "finalize";
export type ParserProgress = (pct: number, label: string, stage: ParserStage) => void;
export type ParserLog = (scope: string, event: string, data: unknown, level: "info" | "warn" | "error" | "debug") => void;

export function parseDemoFull(
  file: File,
  onProgress?: ParserProgress,
  onLog?: ParserLog,
): Promise<RawParsedDemo> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/demoParser.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { try { worker.terminate(); } catch { /* noop */ } };
    worker.onerror = (e) => {
      cleanup();
      onLog?.("worker", "onerror", { message: e.message, filename: e.filename, lineno: e.lineno }, "error");
      reject(new Error(`Worker error: ${e.message || "desconocido"}`));
    };
    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type: string; pct?: number; label?: string; stage?: ParserStage; message?: string; data?: RawParsedDemo; scope?: string; event?: string; level?: "info" | "warn" | "error" | "debug" };
      if (msg.type === "progress") {
        onProgress?.(msg.pct ?? 0, msg.label ?? "", msg.stage ?? "parse");
      } else if (msg.type === "log") {
        onLog?.(msg.scope ?? "worker", msg.event ?? "log", msg.data, msg.level ?? "info");
      } else if (msg.type === "done" && msg.data) {
        cleanup();
        resolve(msg.data);
      } else if (msg.type === "error") {
        cleanup();
        onLog?.("worker", "message-error", { message: msg.message }, "error");
        reject(new Error(msg.message ?? "Error del worker"));
      }
    };
    worker.postMessage({ file });
  });
}


// ─── Public entry point ────────────────────────────────────────────────────

export async function parseDemoHeader(
  file: File,
  opts?: { onProgress?: (pct: number, label: string) => void },
): Promise<ParsedDemoHeader> {
  const onP = opts?.onProgress ?? (() => {});
  const isBz2 = /\.bz2$/i.test(file.name);

  onP(5, isBz2 ? "Descomprimiendo header (bz2)" : "Leyendo header");

  // We only need the very first bytes of the uncompressed stream.
  // 512 KB is a generous ceiling that covers even bloated CDemoFileHeaders.
  const HEADER_BUDGET = 512 * 1024;
  let raw: Uint8Array;

  if (isBz2) {
    // Read enough of the compressed file to guarantee we can decompress the
    // first bz2 block (max 900 KB uncompressed). 4 MB of compressed input is
    // typically 6-40 MB of output — plenty of margin.
    const COMPRESSED_SLICE = 4 * 1024 * 1024;
    const slice = file.slice(0, Math.min(file.size, COMPRESSED_SLICE));
    const compressed = new Uint8Array(await slice.arrayBuffer());
    onP(20, "Descomprimiendo bloque bz2");
    raw = decompressBz2Partial(compressed, HEADER_BUDGET);
  } else {
    const slice = file.slice(0, Math.min(file.size, HEADER_BUDGET));
    raw = new Uint8Array(await slice.arrayBuffer());
  }

  onP(60, "Validando magic CS2");
  const magic = textFromBytes(raw.subarray(0, 8));
  if (magic !== MAGIC_CS2) {
    throw new Error(
      `Magic inválido: esperaba "PBDEMS2\\0", vino "${magic.replace(/\0/g, "\\0")}". ¿Es una demo CS2?`,
    );
  }

  // Header layout: [8 magic][4 fileinfo_offset][4 spare]  → data starts at 16.
  const reader = new WireReader(raw, 16);

  // Iterate commands until we hit DEM_FileHeader.
  let header: Partial<ParsedDemoHeader> = {};
  let sawHeader = false;
  for (let i = 0; i < 32 && reader.hasMore(); i++) {
    const cmdRaw = reader.readVarint();
    const cmd = cmdRaw & ~CMD_COMPRESSED_MASK;
    const compressed = (cmdRaw & CMD_COMPRESSED_MASK) !== 0;
    reader.readVarint(); // tick
    const size = reader.readVarint();
    const body = reader.readBytes(size);

    if (cmd === DEM_FILE_HEADER) {
      // DEM_FileHeader is never snappy-compressed in practice, but we bail
      // clearly if it is because we haven't wired snappy in this iteration.
      if (compressed) {
        throw new Error("DEM_FileHeader viene comprimido con snappy — este parser aún no soporta ese caso");
      }
      header = decodeFileHeader(body);
      header.isCompressed = compressed;
      sawHeader = true;
      break;
    }
  }

  onP(95, "Header decodificado");
  if (!sawHeader || !header.rawMapName) {
    throw new Error("No se encontró DEM_FileHeader en los primeros comandos");
  }

  return {
    map: normalizeMapName(header.rawMapName),
    rawMapName: header.rawMapName,
    serverName: header.serverName ?? "",
    clientName: header.clientName ?? "",
    demoVersionName: header.demoVersionName ?? "",
    buildNum: header.buildNum ?? 0,
    isCompressed: !!header.isCompressed,
    bytesRead: reader.offset,
  };
}

// ─── CDemoFileHeader protobuf decoder ─────────────────────────────────────
// Only the fields we care about. Ignores everything else.

function decodeFileHeader(body: Uint8Array): Partial<ParsedDemoHeader> {
  const r = new WireReader(body, 0);
  const out: Partial<ParsedDemoHeader> = {};
  while (r.hasMore()) {
    const tag = r.readVarint();
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    switch (fieldNum) {
      case 3: // server_name
        out.serverName = readString(r, wireType);
        break;
      case 4: // client_name
        out.clientName = readString(r, wireType);
        break;
      case 5: // map_name
        out.rawMapName = readString(r, wireType);
        break;
      case 11: // demo_version_name
        out.demoVersionName = readString(r, wireType);
        break;
      case 13: // build_num
        out.buildNum = wireType === 0 ? r.readVarint() : (skipField(r, wireType), 0);
        break;
      default:
        skipField(r, wireType);
    }
  }
  return out;
}

function readString(r: WireReader, wireType: number): string {
  if (wireType !== 2) {
    skipField(r, wireType);
    return "";
  }
  const len = r.readVarint();
  return textFromBytes(r.readBytes(len));
}

function skipField(r: WireReader, wireType: number) {
  switch (wireType) {
    case 0: r.readVarint(); return;                    // varint
    case 1: r.readBytes(8); return;                    // 64-bit
    case 2: r.readBytes(r.readVarint()); return;       // length-delimited
    case 5: r.readBytes(4); return;                    // 32-bit
    default: throw new Error(`wire type no soportado: ${wireType}`);
  }
}

// ─── Minimal wire reader ──────────────────────────────────────────────────

class WireReader {
  constructor(private buf: Uint8Array, public offset: number) {}
  hasMore() { return this.offset < this.buf.length; }
  readByte(): number {
    if (this.offset >= this.buf.length) throw new Error("EOF");
    return this.buf[this.offset++];
  }
  readBytes(n: number): Uint8Array {
    if (this.offset + n > this.buf.length) throw new Error(`EOF (needed ${n}, have ${this.buf.length - this.offset})`);
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
  readVarint(): number {
    let result = 0, shift = 0;
    // Cap at 5 bytes (32-bit varint) — demo cmd/size never overflow that.
    for (let i = 0; i < 10; i++) {
      const b = this.readByte();
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result >>> 0;
      shift += 7;
      if (shift >= 64) throw new Error("varint demasiado largo");
    }
    throw new Error("varint sin terminador");
  }
}

// ─── bz2 partial decompression ────────────────────────────────────────────
// seek-bzip's `Bunzip.decode(input, output)` accepts either:
//   - a Buffer/Uint8Array to fill exactly (throws if size mismatches), or
//   - a Stream-like object with `writeByte(b)` and optionally `write(buf,off,len)`.
// We use the stream shape with an early-abort throw so we never allocate
// the full 1 GB uncompressed demo — we stop as soon as we have enough bytes
// for the header (~512 KB is plenty).

class Bz2EnoughError extends Error {
  constructor() { super("__bz2_enough__"); }
}

function decompressBz2Partial(compressed: Uint8Array, maxOutBytes: number): Uint8Array {
  const out = new Uint8Array(maxOutBytes);
  let written = 0;

  const sink = {
    writeByte(b: number) {
      if (written >= maxOutBytes) throw new Bz2EnoughError();
      out[written++] = b;
    },
    // Fast-path when seek-bzip calls write() with a chunk instead of byte-by-byte.
    write(buffer: Uint8Array, offset: number, length: number): number {
      const remaining = maxOutBytes - written;
      if (remaining <= 0) throw new Bz2EnoughError();
      const take = Math.min(length, remaining);
      out.set(buffer.subarray(offset, offset + take), written);
      written += take;
      if (written >= maxOutBytes) throw new Bz2EnoughError();
      return take;
    },
    flush() { /* no-op */ },
  };

  try {
    Bunzip.decode(compressed, sink);
  } catch (e) {
    if (e instanceof Bz2EnoughError) {
      // Expected: we stopped decompression on purpose.
    } else if (written > 0) {
      // seek-bzip can throw at end-of-input when we sliced mid-block; that's
      // fine as long as we already extracted enough bytes for the header.
    } else {
      throw new Error("bz2: " + (e as Error).message);
    }
  }

  if (written === 0) {
    throw new Error("bz2: no se pudo descomprimir ningún byte (¿archivo corrupto?)");
  }
  return out.subarray(0, written);
}

// ─── Utils ────────────────────────────────────────────────────────────────

function textFromBytes(b: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(b);
}
