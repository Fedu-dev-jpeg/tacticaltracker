import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const log: Record<string, string> = {};
  for (const u of list.users) {
    if (!u.email) continue;
    if (u.email === "fedu@hambrientos.com") { log[u.email] = "skipped"; continue; }
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      password: "tactical1",
      email_confirm: true,
    });
    log[u.email] = error ? `err: ${error.message}` : "reset";
  }

  return new Response(JSON.stringify({ ok: true, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
