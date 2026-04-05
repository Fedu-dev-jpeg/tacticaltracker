import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const players = ["froud", "fedu", "hanzo", "diuva", "gyer", "pank", "ian"];
  const results: Record<string, string> = {};

  for (const player of players) {
    const email = `${player}@hambrientos.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "hambre",
      email_confirm: true,
      user_metadata: { player_name: player.charAt(0).toUpperCase() + player.slice(1) },
    });

    if (error) {
      if (error.message?.includes("already been registered")) {
        results[player] = "already exists";
      } else {
        results[player] = `error: ${error.message}`;
      }
    } else {
      results[player] = "created";
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
