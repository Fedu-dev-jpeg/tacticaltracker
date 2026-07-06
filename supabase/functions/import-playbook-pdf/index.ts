import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_MAPS = ["Nuke", "Ancient", "Anubis", "Inferno", "Mirage", "Dust2", "Vertigo", "Overpass", "Train"];
const VALID_TYPES = [
  "Pistol", "Anti-Eco", "Forzado", "Default", "Exec", "Setup",
  "Dominio", "Retake", "Postplant", "Finalización", "Calls de base", "Sorpresa",
];

interface ParsedStrat {
  name: string;
  type: string;
  side: "CT" | "TR";
  description: string;
  playerRoles: Record<string, string>;
  notes: string;
  link: string;
  warnings: string[];
}

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

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

    const { pdf_base64, raw_text, map, book = "estrategias" } = await req.json();
    const hasPdf = typeof pdf_base64 === "string" && pdf_base64.length > 0;
    const hasRawText = typeof raw_text === "string" && raw_text.trim().length > 0;
    if (!hasPdf && !hasRawText) {
      return json({ error: "enviá pdf_base64 o raw_text" }, 400);
    }
    if (hasPdf) {
      // Approx byte size from base64 length
      const approxBytes = Math.floor((pdf_base64.length * 3) / 4);
      if (approxBytes > MAX_PDF_BYTES) return json({ error: "pdf demasiado grande (máx 5 MB)" }, 413);
    }
    if (!map || !VALID_MAPS.includes(map)) return json({ error: "mapa inválido" }, 400);

    let fullText = "";
    if (hasRawText) {
      fullText = String(raw_text).trim();
    } else {
      // Decode base64
      const bin = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
      // Extract text with unpdf
      const doc = await getDocumentProxy(bin);
      const { text } = await extractText(doc, { mergePages: true });
      fullText = Array.isArray(text) ? text.join("\n") : text;
    }

    // Parse strategies
    const parsed = parseStrategies(fullText);
    if (parsed.length === 0) {
      return json({
        error: "No se encontró ninguna estrategia con el formato esperado. Revisá el formato en la ayuda del importador.",
        raw_text_preview: fullText.slice(0, 800),
      }, 400);
    }

    // Insert
    const rows = parsed.map((p) => ({
      map,
      side: p.side,
      type: p.type,
      name: p.name,
      description: p.description,
      player_roles: p.playerRoles,
      notes: p.notes,
      link: p.link,
      status: "Draft",
      book,
    }));

    const { data: inserted, error: insErr } = await admin.from("strategies").insert(rows).select("id, name");
    if (insErr) return json({ error: "insert: " + insErr.message }, 500);

    return json({
      status: "imported",
      map,
      book,
      imported: inserted?.length ?? 0,
      strategies: parsed.map((p, i) => ({
        id: inserted?.[i]?.id,
        name: p.name,
        type: p.type,
        side: p.side,
        warnings: p.warnings,
      })),
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

function parseStrategies(text: string): ParsedStrat[] {
  const cleaned = cleanImportedText(text);
  const inferredDefaultSide = inferDefaultSide(cleaned);
  // Split into blocks by `---` line
  const blocks = cleaned
    .split(/\n\s*-{3,}\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const result: ParsedStrat[] = [];
  for (const block of blocks) {
    const strat = parseBlock(block, inferredDefaultSide);
    if (strat) result.push(strat);
  }
  if (result.length > 0) return result;
  return parseTacticalStyle(cleaned, inferredDefaultSide);
}

function parseBlock(block: string, defaultSide: "CT" | "TR"): ParsedStrat | null {
  const warnings: string[] = [];
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Header: `== TIPO :: NOMBRE` OR `# NOMBRE | TIPO | LADO`
  let name = "", type = "Default";
  let side: "CT" | "TR" = defaultSide;
  const header = lines[0];

  const headerA = header.match(/^==\s*([^:]+)::\s*(.+)$/);
  const headerB = header.match(/^#\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(CT|TR))?\s*$/i);

  if (headerA) {
    type = headerA[1].trim();
    name = headerA[2].trim();
  } else if (headerB) {
    name = headerB[1].trim();
    type = headerB[2].trim();
    if (headerB[3]) side = headerB[3].toUpperCase() as "CT" | "TR";
  } else {
    return null;
  }

  if (!VALID_TYPES.includes(type)) {
    warnings.push(`tipo "${type}" no está en la lista estándar, se guardó igual`);
  }

  let description = "";
  let notes = "";
  let link = "";
  const playerRoles: Record<string, string> = {};

  let mode: null | "roles" | "desc" | "notes" = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (/^lado:/i.test(line)) {
      const v = line.split(":")[1].trim().toUpperCase();
      if (v === "CT" || v === "TR") side = v;
      mode = null;
    } else if (/^descripci[oó]n:/i.test(line)) {
      description = line.split(":").slice(1).join(":").trim();
      mode = "desc";
    } else if (/^notas:/i.test(line)) {
      notes = line.split(":").slice(1).join(":").trim();
      mode = "notes";
    } else if (/^link:/i.test(line)) {
      link = line.split(":").slice(1).join(":").trim();
      mode = null;
    } else if (/^roles:/i.test(line)) {
      mode = "roles";
    } else if (mode === "roles" && /^[-•*]\s+/.test(line)) {
      const m = line.replace(/^[-•*]\s+/, "").match(/^([^:]+):\s*(.+)$/);
      if (m) playerRoles[m[1].trim()] = m[2].trim();
    } else if (mode === "desc") {
      description += (description ? " " : "") + line;
    } else if (mode === "notes") {
      notes += (notes ? " " : "") + line;
    }
  }

  if (!name) return null;
  return { name, type, side, description, playerRoles, notes, link, warnings };
}

function cleanImportedText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTacticalStyle(text: string, defaultSide: "CT" | "TR"): ParsedStrat[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => Boolean(l) && !/^rondas a preparar/i.test(l));

  const out: ParsedStrat[] = [];
  let currentSide: "CT" | "TR" = defaultSide;
  let currentType = "Default";
  let current: ParsedStrat | null = null;

  const flush = () => {
    if (!current) return;
    current.description = current.description.trim();
    current.notes = current.notes.trim();
    if (!current.description && current.notes) current.description = current.notes;
    if (!current.name || current.name.length < 2) return;
    out.push(current);
  };

  for (const line of lines) {
    // Side section markers commonly used in tactical docs.
    if (/^(tt|tr|terrorist)$/i.test(line)) {
      flush();
      current = null;
      currentSide = "TR";
      continue;
    }
    if (/^(ct|counter.?terrorist)$/i.test(line)) {
      flush();
      current = null;
      currentSide = "CT";
      continue;
    }

    // Type headings.
    const normalizedType = normalizeTypeHeading(line);
    if (normalizedType) {
      flush();
      current = null;
      currentType = normalizedType;
      continue;
    }

    // New strategy start markers.
    const inlineEq = line.match(/^=+\s*(.+?)\s*=+\s*(?:si|no)?$/i);
    const linkHeading = line.match(/^(.+?)\s*\(link\)\s*$/i);
    if (inlineEq || linkHeading) {
      flush();
      const name = (inlineEq?.[1] ?? linkHeading?.[1] ?? "").trim();
      current = {
        name,
        type: currentType,
        side: currentSide,
        description: "",
        playerRoles: {},
        notes: "",
        link: "",
        warnings: [],
      };
      continue;
    }

    // If we still don't have a strategy, bootstrap one with the first strong heading.
    if (!current && line.length >= 6 && !/^(idea:|protocolo|defas|anti snowball)/i.test(line)) {
      current = {
        name: line,
        type: currentType,
        side: currentSide,
        description: "",
        playerRoles: {},
        notes: "",
        link: "",
        warnings: [],
      };
      continue;
    }

    if (!current) continue;

    // Player role lines from tactical notes: "fedu > ...", "kud: ..."
    const roleMatch = line.match(/^([a-záéíóú0-9_.-]{3,12})\s*(?:>|:)\s*(.+)$/i);
    if (roleMatch) {
      const player = normalizePlayerName(roleMatch[1]);
      const role = roleMatch[2].trim();
      if (player) {
        current.playerRoles[player] = role;
      } else {
        current.notes += `${current.notes ? " " : ""}${line}`;
      }
      continue;
    }

    if (/^https?:\/\//i.test(line)) {
      current.link = line;
      continue;
    }

    if (/^(idea:|protocolo|anti snowball|defas|forzado|pistols?)/i.test(line)) {
      current.notes += `${current.notes ? " " : ""}${line}`;
      continue;
    }

    current.description += `${current.description ? " " : ""}${line}`;
  }

  flush();
  return out;
}

function inferDefaultSide(text: string): "CT" | "TR" {
  const ctHits = (text.match(/\b(ct|counter.?terrorist)\b/gi) ?? []).length;
  const trHits = (text.match(/\b(tt|tr|terrorist)\b/gi) ?? []).length;
  if (trHits > ctHits) return "TR";
  return "CT";
}

function normalizeTypeHeading(line: string): string | null {
  const l = line.trim().toLowerCase();
  if (/^pistols?$/.test(l)) return "Pistol";
  if (/^forzado/.test(l)) return "Forzado";
  if (/^anti/.test(l)) return "Anti-Eco";
  if (/^defas?$/.test(l) || /^default/.test(l)) return "Default";
  if (/^retake/.test(l)) return "Retake";
  if (/^postplant/.test(l)) return "Postplant";
  if (/^exec/.test(l)) return "Exec";
  if (/^setup/.test(l)) return "Setup";
  if (/^dominio|^control/.test(l)) return "Dominio";
  if (/^sorpresa/.test(l)) return "Sorpresa";
  return null;
}

function normalizePlayerName(raw: string): string | null {
  const n = raw
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const aliases: Record<string, string> = {
    fedu: "Fedu",
    fede: "Fedu",
    boke: "Boke",
    koda: "Koda",
    ray: "Ray",
    kud: "Kud",
  };
  return aliases[n] ?? null;
}
