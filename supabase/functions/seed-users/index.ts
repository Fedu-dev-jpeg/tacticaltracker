import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Role = "player" | "coach" | "admin";
interface Seed {
  handle: string;
  password: string;
  role: Role;
  is_coach: boolean;
  role_in_team: string;
}

const DOMAIN = "hambrientos.com";
const DEFAULT_PASSWORD = "tactical1";
const FEDU_PASSWORD = "Fedeesel1*";

interface RosterEntry {
  handle: string;
  role: Role;
  is_coach: boolean;
  role_in_team: string;
}

const ROSTER_META: RosterEntry[] = [
  { handle: "fedu", role: "admin", is_coach: false, role_in_team: "IGL / Support" },
  { handle: "boke", role: "player", is_coach: false, role_in_team: "Rifler" },
  { handle: "kud", role: "player", is_coach: false, role_in_team: "Rifler" },
  { handle: "koda", role: "player", is_coach: false, role_in_team: "AWPer" },
  { handle: "ray", role: "player", is_coach: false, role_in_team: "Rifler" },
  { handle: "pakito", role: "coach", is_coach: true, role_in_team: "Head Coach" },
  { handle: "ema", role: "coach", is_coach: true, role_in_team: "Assistant Coach" },
];
const ALLOWED_EMAILS = new Set(ROSTER_META.map((r) => `${r.handle}@${DOMAIN}`));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Auth: require signed-in admin ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ROSTER: Seed[] = ROSTER_META.map((r) => ({
    ...r,
    password: r.handle === "fedu" ? FEDU_PASSWORD : DEFAULT_PASSWORD,
  }));

  const log: Record<string, string> = {};

  // Delete users NOT in roster
  const { data: existing } = await admin.auth.admin.listUsers();
  for (const u of existing?.users ?? []) {
    if (!u.email || !ALLOWED_EMAILS.has(u.email)) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      log[u.email ?? u.id] = error ? `delete err: ${error.message}` : "deleted";
    }
  }


  // Refresh existing user list
  const { data: after } = await admin.auth.admin.listUsers();
  const byEmail = new Map((after?.users ?? []).map((u) => [u.email!, u]));

  // Ensure each roster user exists with right password + metadata
  for (const s of ROSTER) {
    const email = `${s.handle}@${DOMAIN}`;
    const player_name = s.handle.charAt(0).toUpperCase() + s.handle.slice(1);
    let userId: string | null = null;

    const existingU = byEmail.get(email);
    if (existingU) {
      userId = existingU.id;
      const { error } = await admin.auth.admin.updateUserById(existingU.id, {
        password: s.password,
        user_metadata: { player_name, role: s.role },
      });
      log[email] = error ? `update err: ${error.message}` : "updated";
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: s.password,
        email_confirm: true,
        user_metadata: { player_name, role: s.role },
      });
      if (error) {
        log[email] = `create err: ${error.message}`;
        continue;
      }
      userId = data.user!.id;
      log[email] = "created";
    }

    if (!userId) continue;

    // Sync user_roles (wipe + insert)
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role: s.role });

    // Sync team_members (upsert)
    await admin.from("team_members").upsert(
      {
        user_id: userId,
        player_name,
        is_coach: s.is_coach,
        role_in_team: s.role_in_team,
      },
      { onConflict: "user_id" }
    );
  }

  return new Response(JSON.stringify({ ok: true, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
