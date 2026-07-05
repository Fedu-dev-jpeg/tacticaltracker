// Teamup Calendar sync — bidirectional.
// Actions supported (POST body):
//   { action: "pull" }                                → import from Teamup into agenda_events
//   { action: "push", event: {...agenda_events row} } → upsert one event into Teamup
//   { action: "delete", teamup_event_id: "..." }      → delete one event from Teamup
//
// Credentials come from public.integrations, scoped to the caller's user_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAMUP_BASE = "https://api.teamup.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes.user) return json({ error: "invalid token" }, 401);
    const userId = userRes.user.id;

    const { data: integ } = await admin
      .from("integrations")
      .select("teamup_calendar_key, teamup_api_key, teamup_password")
      .eq("user_id", userId)
      .maybeSingle();

    if (!integ?.teamup_calendar_key || !integ?.teamup_api_key) {
      return json({ error: "Teamup no configurado. Guardá calendar key + API key primero." }, 400);
    }
    const calKey = integ.teamup_calendar_key;
    const apiKey = integ.teamup_api_key;
    const calPass = (integ as { teamup_password?: string | null }).teamup_password ?? "";
    const teamupHeaders: Record<string, string> = { "Teamup-Token": apiKey };
    if (calPass) teamupHeaders["Teamup-Password"] = calPass;


    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = body.action as string;

    if (action === "pull") {
      const today = new Date();
      const start = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
      const end = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);
      const url = `${TEAMUP_BASE}/${calKey}/events?startDate=${start}&endDate=${end}`;
      const res = await fetch(url, { headers: teamupHeaders });
      if (!res.ok) return json({ error: `Teamup pull: ${res.status} ${await res.text()}` }, 502);
      const payload = await res.json();
      const events = (payload.events ?? []) as Array<{
        id: string;
        title?: string;
        notes?: string;
        start_dt: string;
        end_dt: string;
      }>;

      let imported = 0;
      for (const ev of events) {
        const startDt = new Date(ev.start_dt);
        const endDt = new Date(ev.end_dt);
        const date = startDt.toISOString().slice(0, 10);
        const time_start = startDt.toISOString().slice(11, 16);
        const time_end = endDt.toISOString().slice(11, 16);
        const { error } = await admin.from("agenda_events").upsert(
          {
            teamup_event_id: ev.id,
            title: ev.title ?? "(sin título)",
            description: (ev.notes ?? "").replace(/<[^>]*>/g, ""),
            date,
            time_start,
            time_end,
            event_type: "training",
            created_by: "teamup",
          },
          { onConflict: "teamup_event_id" },
        );
        if (!error) imported++;
      }

      await admin.from("integrations").update({ teamup_last_sync: new Date().toISOString() }).eq("user_id", userId);
      return json({ ok: true, imported, total: events.length, range: { start, end } });
    }

    if (action === "push") {
      const ev = body.event as {
        id: string;
        title: string;
        description?: string;
        date: string;
        time_start: string;
        time_end: string;
        teamup_event_id?: string | null;
      };
      const payload = {
        title: ev.title,
        notes: ev.description ?? "",
        start_dt: `${ev.date}T${ev.time_start}:00`,
        end_dt: `${ev.date}T${ev.time_end}:00`,
        subcalendar_ids: [] as number[],
        all_day: false,
      };

      // Teamup requires at least one subcalendar. Fetch the list once and use the first.
      const subs = await fetch(`${TEAMUP_BASE}/${calKey}/subcalendars`, {
        headers: teamupHeaders,
      }).then((r) => r.json()).catch(() => ({ subcalendars: [] }));
      const firstSub = subs.subcalendars?.[0]?.id;
      if (firstSub) payload.subcalendar_ids = [firstSub];

      let res: Response;
      if (ev.teamup_event_id) {
        res = await fetch(`${TEAMUP_BASE}/${calKey}/events/${ev.teamup_event_id}`, {
          method: "PUT",
          headers: { ...teamupHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: ev.teamup_event_id, version: undefined }),
        });
      } else {
        res = await fetch(`${TEAMUP_BASE}/${calKey}/events`, {
          method: "POST",
          headers: { ...teamupHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) return json({ error: `Teamup push: ${res.status} ${await res.text()}` }, 502);
      const created = await res.json();
      const newTeamupId = created?.event?.id ?? ev.teamup_event_id;
      if (ev.id && newTeamupId && newTeamupId !== ev.teamup_event_id) {
        await admin.from("agenda_events").update({ teamup_event_id: newTeamupId }).eq("id", ev.id);
      }
      return json({ ok: true, teamup_event_id: newTeamupId });
    }

    if (action === "delete") {
      const teamupId = body.teamup_event_id as string;
      if (!teamupId) return json({ error: "teamup_event_id requerido" }, 400);
      const res = await fetch(`${TEAMUP_BASE}/${calKey}/events/${teamupId}`, {
        method: "DELETE",
        headers: teamupHeaders,
      });
      if (!res.ok && res.status !== 404) {
        return json({ error: `Teamup delete: ${res.status} ${await res.text()}` }, 502);
      }
      return json({ ok: true });
    }

    return json({ error: "action inválido" }, 400);
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
