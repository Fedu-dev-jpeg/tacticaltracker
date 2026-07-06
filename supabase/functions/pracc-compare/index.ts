import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgendaEventRow {
  id: string;
  title: string;
  description: string;
  date: string;
  time_start: string;
  time_end: string;
  event_type: string;
}

interface ExternalEvent {
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  sourceId: string | null;
  searching: boolean;
}

interface AgendaComparable extends AgendaEventRow {
  start: Date;
  end: Date;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes.user) return json({ error: "invalid token" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const feedUrl = String(body.feed_url ?? "").trim();
    if (!feedUrl) return json({ error: "feed_url requerido" }, 400);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(feedUrl);
    } catch {
      return json({ error: "feed_url inválido" }, 400);
    }
    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      return json({ error: "feed_url debe ser http(s)" }, 400);
    }

    const daysBack = clampNum(body.days_back, 30, 0, 365);
    const daysForward = clampNum(body.days_forward, 45, 1, 365);

    const now = new Date();
    const rangeStart = startOfDay(new Date(now.getTime() - daysBack * 86400_000));
    const rangeEnd = endOfDay(new Date(now.getTime() + daysForward * 86400_000));
    const rangeStartDate = rangeStart.toISOString().slice(0, 10);
    const rangeEndDate = rangeEnd.toISOString().slice(0, 10);

    const feedRes = await fetch(feedUrl, {
      headers: {
        "User-Agent": "TacticalTracker/1.0 (+agenda-compare)",
        "Accept": "application/json, text/calendar, text/plain, */*",
      },
    });
    if (!feedRes.ok) {
      return json({ error: `No se pudo leer feed (${feedRes.status})` }, 502);
    }

    const contentType = feedRes.headers.get("content-type") ?? "";
    const rawText = await feedRes.text();
    const externalEvents = parseExternalEvents(rawText, contentType)
      .filter((ev) => {
        const start = new Date(ev.startIso);
        return start >= rangeStart && start <= rangeEnd;
      })
      .sort((a, b) => a.startIso.localeCompare(b.startIso));

    const { data: agendaRows, error: agendaErr } = await admin
      .from("agenda_events")
      .select("id, title, description, date, time_start, time_end, event_type")
      .gte("date", rangeStartDate)
      .lte("date", rangeEndDate)
      .order("date")
      .order("time_start");
    if (agendaErr) return json({ error: "Error cargando agenda: " + agendaErr.message }, 500);

    const agenda = (agendaRows ?? []) as AgendaEventRow[];
    const externalComparable = externalEvents.map((ev) => ({
      ...ev,
      start: new Date(ev.startIso),
      end: new Date(ev.endIso),
    }));
    const agendaComparable = agenda.map((ev) => {
      const start = parseAgendaDateTime(ev.date, ev.time_start);
      const end = parseAgendaDateTime(ev.date, ev.time_end || ev.time_start);
      return { ...ev, start, end };
    }) as AgendaComparable[];
    const agendaScrim = agendaComparable.filter(isAgendaScrimEvent);

    const matchWindowMin = 60;
    const missingInPracc = agendaScrim.filter((ag) =>
      !externalComparable.some((ex) => sameDay(ag.start, ex.start) && minutesDiff(ag.start, ex.start) <= matchWindowMin)
    );
    const missingInAgenda = externalComparable.filter((ex) =>
      !agendaScrim.some((ag) => sameDay(ag.start, ex.start) && minutesDiff(ag.start, ex.start) <= matchWindowMin)
    );
    const searchingNow = externalComparable.filter((ev) => ev.searching);

    return json({
      ok: true,
      source: {
        feed_url: feedUrl,
        content_type: contentType,
        events_count: externalComparable.length,
      },
      range: { start: rangeStartDate, end: rangeEndDate },
      summary: {
        agenda_total: agendaScrim.length,
        pracc_total: externalComparable.length,
        searching_total: searchingNow.length,
        missing_in_pracc: missingInPracc.length,
        missing_in_agenda: missingInAgenda.length,
        match_window_minutes: matchWindowMin,
      },
      searching: searchingNow.map(mapExternalOut),
      missing_in_pracc: missingInPracc.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        time_start: ev.time_start,
        time_end: ev.time_end,
        event_type: ev.event_type,
      })),
      missing_in_agenda: missingInAgenda.map(mapExternalOut),
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

function parseExternalEvents(rawText: string, contentType: string): ExternalEvent[] {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || isLikelyJson(rawText)) {
    const parsed = JSON.parse(rawText);
    return parseEventsFromJson(parsed);
  }
  return parseEventsFromIcs(rawText);
}

function isAgendaScrimEvent(ev: AgendaComparable): boolean {
  const type = (ev.event_type ?? "").toLowerCase();
  if (type === "scrim" || type === "training") return true;
  const text = `${ev.title} ${ev.description}`.toLowerCase();
  return /\b(scrim|pracc|treino|entreno|vs\.?)\b/.test(text);
}

function parseEventsFromJson(input: unknown): ExternalEvent[] {
  const candidates: unknown[] = [];
  if (Array.isArray(input)) {
    candidates.push(...input);
  } else if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["events", "data", "items", "matches", "requests"]) {
      if (Array.isArray(obj[key])) candidates.push(...(obj[key] as unknown[]));
    }
  }

  const out: ExternalEvent[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const ev = item as Record<string, unknown>;
    const title = String(ev.title ?? ev.name ?? ev.summary ?? "Sin título");
    const description = String(ev.description ?? ev.notes ?? ev.note ?? "");
    const start =
      toIsoMaybe(ev.startIso) ??
      toIsoMaybe(ev.start_dt) ??
      toIsoMaybe(ev.start) ??
      toIsoMaybe(ev.startDate) ??
      toIsoMaybe(ev.date_start);
    const end =
      toIsoMaybe(ev.endIso) ??
      toIsoMaybe(ev.end_dt) ??
      toIsoMaybe(ev.end) ??
      toIsoMaybe(ev.endDate) ??
      toIsoMaybe(ev.date_end) ??
      start;
    if (!start) continue;

    out.push({
      title,
      description,
      startIso: start,
      endIso: end ?? start,
      sourceId: ev.id != null ? String(ev.id) : null,
      searching: isSearchingText(`${title} ${description}`),
    });
  }
  return out;
}

function parseEventsFromIcs(icsText: string): ExternalEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const out: ExternalEvent[] = [];

  let inEvent = false;
  let buffer: Record<string, string> = {};
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      buffer = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      const title = buffer.SUMMARY ?? "Sin título";
      const description = buffer.DESCRIPTION ?? "";
      const startRaw = buffer.DTSTART;
      const endRaw = buffer.DTEND ?? startRaw;
      const startIso = parseIcsDate(startRaw);
      const endIso = parseIcsDate(endRaw) ?? startIso;
      if (startIso) {
        out.push({
          title,
          description,
          startIso,
          endIso: endIso ?? startIso,
          sourceId: buffer.UID ?? null,
          searching: isSearchingText(`${title} ${description}`),
        });
      }
      buffer = {};
      continue;
    }
    if (!inEvent) continue;
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const left = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    const key = left.split(";")[0].toUpperCase();
    buffer[key] = value;
  }

  return out;
}

function parseIcsDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(Date.UTC(y, m, d, hh, mm, ss)).toISOString();
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(y, m, d, hh, mm, ss).toISOString();
  }
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return new Date(y, m, d, 0, 0, 0).toISOString();
  }
  return toIsoMaybe(v);
}

function toIsoMaybe(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseAgendaDateTime(date: string, time: string): Date {
  const hhmm = /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  const d = new Date(`${date}T${hhmm}:00`);
  return Number.isNaN(d.getTime()) ? new Date(`${date}T00:00:00`) : d;
}

function isLikelyJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function isSearchingText(text: string): boolean {
  const s = text.toLowerCase();
  return /\b(lfs|looking for scrim|scrim search|request|buscando|searching|offer)\b/.test(s);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function minutesDiff(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 60000));
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function mapExternalOut(ev: ExternalEvent & { start?: Date; end?: Date }) {
  const start = ev.start ?? new Date(ev.startIso);
  const end = ev.end ?? new Date(ev.endIso);
  return {
    source_id: ev.sourceId,
    title: ev.title,
    description: ev.description,
    start_iso: start.toISOString(),
    end_iso: end.toISOString(),
    date: start.toISOString().slice(0, 10),
    time_start: start.toISOString().slice(11, 16),
    time_end: end.toISOString().slice(11, 16),
    searching: ev.searching,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
