import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
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
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
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

    let memberId: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      memberId = body?.member_id;
    }


    let query = supabase.from("team_members").select("id, player_name, steam_id").not("steam_id", "is", null);
    if (memberId) query = query.eq("id", memberId);

    const { data: members, error } = await query;

    if (error) throw error;

    const results: Array<{ player: string; ok: boolean; avatar?: string; error?: string }> = [];

    for (const m of members ?? []) {
      const steamId = (m as { steam_id: string }).steam_id;
      try {
        const res = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`, {
          headers: { "User-Agent": "TacticalTracker/1.0" },
        });
        const xml = await res.text();
        // avatarFull is inside CDATA
        const match = xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
        const avatar = match?.[1];
        if (!avatar) {
          results.push({ player: (m as { player_name: string }).player_name, ok: false, error: "no avatar (perfil privado?)" });
          continue;
        }
        const { error: upErr } = await supabase
          .from("team_members")
          .update({ steam_avatar_url: avatar })
          .eq("id", (m as { id: string }).id);
        if (upErr) throw upErr;
        results.push({ player: (m as { player_name: string }).player_name, ok: true, avatar });
      } catch (err) {
        results.push({
          player: (m as { player_name: string }).player_name,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(JSON.stringify({ synced: results.filter((r) => r.ok).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
