import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: real .dem parsing is a heavy binary parse.
// This function ships as a scaffolded stub that:
//   1) verifies the demo exists in storage
//   2) returns a best-effort placeholder response with the file name
//   3) leaves player_stats writing to a future implementation
// Once a Deno-compatible .dem parser is wired in, expand this function.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { path } = await req.json();
    if (!path || typeof path !== "string") {
      return json({ error: "path requerido" }, 400);
    }

    const { data: file, error } = await admin.storage.from("demos").download(path);
    if (error || !file) {
      return json({ error: "Demo no encontrada: " + (error?.message ?? "unknown") }, 404);
    }

    // Load current team roster for future matching
    const { data: team } = await admin.from("team_members").select("user_id, steam_id, steam_tag, player_name");
    const roster = team ?? [];

    // Placeholder response — real parser to be implemented.
    // Consumers should treat empty players[] as "manual entry required".
    const response = {
      status: "parsed_stub",
      file_size: file.size,
      map: null,
      score_us: null,
      score_them: null,
      rival: null,
      starting_side: null,
      players: [] as Array<{ steam_id: string; steam_tag: string; matched_user_id: string | null }>,
      note:
        "El parser de .dem está pendiente de implementación completa. Podés completar el registro manualmente.",
      roster_hint: roster.length,
    };

    return json(response);
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
