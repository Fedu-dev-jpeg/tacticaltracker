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

  const results: Record<string, string> = {};

  // Delete all users except fedu
  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
  if (allUsers?.users) {
    for (const user of allUsers.users) {
      if (user.email !== "fedu@hambrientos.com") {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        results[user.email || user.id] = error ? `delete error: ${error.message}` : "deleted";
      }
    }
  }

  // Update fedu's password to "admin"
  const feduUser = allUsers?.users?.find(u => u.email === "fedu@hambrientos.com");
  if (feduUser) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(feduUser.id, { password: "admin" });
    results["fedu"] = error ? `password update error: ${error.message}` : "password updated to admin";
  } else {
    // Create fedu if doesn't exist
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: "fedu@hambrientos.com",
      password: "admin",
      email_confirm: true,
      user_metadata: { player_name: "Fedu" },
    });
    results["fedu"] = error ? `create error: ${error.message}` : "created with password admin";
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
