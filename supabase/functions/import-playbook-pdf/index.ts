import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_MAPS = ["Nuke", "Ancient", "Anubis", "Inferno", "Mirage", "Dust2", "Vertigo", "Overpass", "Train"];
const VALID_SIDES = ["CT", "TR"];
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { pdf_base64, map, book = "estrategias", default_side = "CT" } = await req.json();
    if (!pdf_base64) return json({ error: "pdf_base64 requerido" }, 400);
    if (!map || !VALID_MAPS.includes(map)) return json({ error: "mapa inválido" }, 400);

    // Decode base64
    const bin = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));

    // Extract text with unpdf
    const doc = await getDocumentProxy(bin);
    const { text } = await extractText(doc, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join("\n") : text;

    // Parse strategies
    const parsed = parseStrategies(fullText, default_side as "CT" | "TR");
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

function parseStrategies(text: string, defaultSide: "CT" | "TR"): ParsedStrat[] {
  // Split into blocks by `---` line
  const blocks = text
    .split(/\n\s*-{3,}\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const result: ParsedStrat[] = [];
  for (const block of blocks) {
    const strat = parseBlock(block, defaultSide);
    if (strat) result.push(strat);
  }
  return result;
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
      if (VALID_SIDES.includes(v)) side = v as "CT" | "TR";
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
