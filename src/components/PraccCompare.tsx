import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, RefreshCw, AlertTriangle, CheckCircle2, Search } from "lucide-react";

interface CompareEvent {
  source_id?: string | null;
  title: string;
  description?: string;
  date: string;
  time_start: string;
  time_end: string;
  searching?: boolean;
}

interface CompareResult {
  summary: {
    agenda_total: number;
    pracc_total: number;
    searching_total: number;
    missing_in_pracc: number;
    missing_in_agenda: number;
    match_window_minutes: number;
  };
  searching: CompareEvent[];
  missing_in_pracc: CompareEvent[];
  missing_in_agenda: CompareEvent[];
}

interface AgendaComparable {
  id: string;
  title: string;
  description: string;
  event_type: string;
  date: string;
  time_start: string;
  time_end: string;
  start: Date;
}

interface ExternalComparable {
  source_id?: string | null;
  title: string;
  description?: string;
  date: string;
  time_start: string;
  time_end: string;
  start: Date;
  searching: boolean;
}

export default function PraccCompare() {
  const [feedUrl, setFeedUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("pracc:feed_url") ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);

  const runCompare = async () => {
    const url = feedUrl.trim();
    if (!url) {
      toast.error("Pegá el link de calendario/feed de PRACC");
      return;
    }
    if (typeof window !== "undefined") window.localStorage.setItem("pracc:feed_url", url);
    setLoading(true);
    const t = toast.loading("Comparando agenda con PRACC...");
    const payload = { feed_url: url, days_back: 30, days_forward: 45 };
    let edgeReason = "";

    try {
      const { data, error } = await supabase.functions.invoke("pracc-compare", { body: payload });
      if (!error && !(data as { error?: string })?.error) {
        setLoading(false);
        setResult(data as CompareResult);
        toast.success("Comparación lista", { id: t });
        return;
      }
      edgeReason = error?.message ?? (data as { error?: string })?.error ?? "edge-error";
    } catch (invokeError) {
      edgeReason = (invokeError as Error).message || "invoke-failed";
    }

    // Secondary fallback: direct HTTP call to the Edge Function endpoint.
    try {
      const direct = await compareViaEdgeHttp(payload);
      setResult(direct);
      setLoading(false);
      toast.success("Comparación lista (fallback edge HTTP)", { id: t, description: edgeReason });
      return;
    } catch (directErr) {
      edgeReason = `${edgeReason} · edge-http: ${(directErr as Error).message}`;
    }

    try {
      const local = await compareLocally(url);
      setResult(local);
      setLoading(false);
      toast.success("Comparación lista (modo fallback local)", { id: t, description: edgeReason });
      return;
    } catch (localError) {
      setLoading(false);
      toast.error("No se pudo comparar", {
        id: t,
        description: `${edgeReason} · fallback local: ${(localError as Error).message}`,
      });
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-accent" />
          PRACC vs Agenda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Link de calendario/feed de PRACC</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="Pegá acá el link de calendario exportado por PRACC"
              className="text-xs"
            />
            <Button size="sm" variant="outline" onClick={runCompare} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Comparando..." : "Comparar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Muestra horarios en PRACC donde están buscando scrim y diferencias entre PRACC y tu agenda local.
          </p>
        </div>

        {result && (
          <>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline">Agenda: {result.summary.agenda_total}</Badge>
              <Badge variant="outline">PRACC: {result.summary.pracc_total}</Badge>
              <Badge className="bg-accent/20 text-accent border-accent/30">
                <Search className="h-3 w-3 mr-1" />
                Buscando scrim: {result.summary.searching_total}
              </Badge>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Falta publicar en PRACC: {result.summary.missing_in_pracc}
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                <Link2 className="h-3 w-3 mr-1" />
                Falta en agenda: {result.summary.missing_in_agenda}
              </Badge>
            </div>

            <EventList
              title="PRACC: buscando treino"
              emptyText="No hay búsquedas activas detectadas"
              events={result.searching}
              icon={<Search className="h-3 w-3 text-accent" />}
            />

            <EventList
              title="Agenda que no está en PRACC"
              emptyText="Todo lo agendado parece publicado en PRACC"
              events={result.missing_in_pracc}
              icon={<AlertTriangle className="h-3 w-3 text-amber-400" />}
            />

            <EventList
              title="PRACC que no está en agenda"
              emptyText="No hay horarios en PRACC faltantes en agenda"
              events={result.missing_in_agenda}
              icon={<CheckCircle2 className="h-3 w-3 text-blue-400" />}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function compareLocally(feedUrl: string): Promise<CompareResult> {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400_000);
  const end = new Date(now.getTime() + 45 * 86400_000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const [feedRes, agendaRes] = await Promise.all([
    fetchWithTimeout(feedUrl, {
      headers: { Accept: "application/json, text/calendar, text/plain, */*" },
    }, 15000),
    supabase
      .from("agenda_events")
      .select("id, title, description, event_type, date, time_start, time_end")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date")
      .order("time_start"),
  ]);

  if (!feedRes.ok) throw new Error(`feed ${feedRes.status}`);
  if (agendaRes.error) throw new Error(`agenda ${agendaRes.error.message}`);

  const raw = await feedRes.text();
  const contentType = (feedRes.headers.get("content-type") ?? "").toLowerCase();
  const external = parseExternalFeed(raw, contentType)
    .filter((ev) => ev.start >= start && ev.start <= end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const agenda = (agendaRes.data ?? []).map((row) => ({
    ...row,
    start: new Date(`${row.date}T${normalizeTime(row.time_start)}:00`),
  })) as AgendaComparable[];

  const matchWindowMin = 60;
  const missingInPracc = agenda.filter((ag) =>
    !external.some((ex) => sameDay(ag.start, ex.start) && minuteDiff(ag.start, ex.start) <= matchWindowMin)
  );
  const missingInAgenda = external.filter((ex) =>
    !agenda.some((ag) => sameDay(ag.start, ex.start) && minuteDiff(ag.start, ex.start) <= matchWindowMin)
  );
  const searching = external.filter((ev) => ev.searching);

  return {
    summary: {
      agenda_total: agenda.length,
      pracc_total: external.length,
      searching_total: searching.length,
      missing_in_pracc: missingInPracc.length,
      missing_in_agenda: missingInAgenda.length,
      match_window_minutes: matchWindowMin,
    },
    searching: searching.map(toCompareEvent),
    missing_in_pracc: missingInPracc.map((ev) => ({
      source_id: ev.id,
      title: ev.title,
      description: ev.description,
      date: ev.date,
      time_start: normalizeTime(ev.time_start),
      time_end: normalizeTime(ev.time_end),
    })),
    missing_in_agenda: missingInAgenda.map(toCompareEvent),
  };
}

async function compareViaEdgeHttp(payload: { feed_url: string; days_back: number; days_forward: number }): Promise<CompareResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) {
    throw new Error("sin sesión autenticada");
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !supabaseKey) throw new Error("config supabase incompleta");

  const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/pracc-compare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify(payload),
  }, 15000);

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const fnError = typeof parsed === "object" && parsed ? String((parsed as { error?: string }).error ?? text) : text;
    throw new Error(`http ${res.status}: ${fnError || "sin detalle"}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("respuesta inválida");
  }
  const err = (parsed as { error?: string }).error;
  if (err) throw new Error(err);
  return parsed as CompareResult;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Failed to fetch (posible CORS, URL inválida o red)");
    }
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error("timeout al consultar feed");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function parseExternalFeed(raw: string, contentType: string): ExternalComparable[] {
  if (contentType.includes("application/json") || isLikelyJson(raw)) {
    return parseExternalJson(raw);
  }
  return parseExternalIcs(raw);
}

function parseExternalJson(raw: string): ExternalComparable[] {
  const parsed = JSON.parse(raw) as unknown;
  const candidates: unknown[] = [];
  if (Array.isArray(parsed)) {
    candidates.push(...parsed);
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["events", "data", "items", "matches", "requests"]) {
      if (Array.isArray(obj[key])) candidates.push(...(obj[key] as unknown[]));
    }
  }

  const out: ExternalComparable[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const ev = c as Record<string, unknown>;
    const title = String(ev.title ?? ev.name ?? ev.summary ?? "Sin título");
    const description = String(ev.description ?? ev.notes ?? "");
    const startIso =
      asIso(ev.startIso) ??
      asIso(ev.start_dt) ??
      asIso(ev.start) ??
      asIso(ev.startDate);
    const endIso =
      asIso(ev.endIso) ??
      asIso(ev.end_dt) ??
      asIso(ev.end) ??
      asIso(ev.endDate) ??
      startIso;
    if (!startIso) continue;
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : start;
    out.push({
      source_id: ev.id != null ? String(ev.id) : null,
      title,
      description,
      date: start.toISOString().slice(0, 10),
      time_start: start.toISOString().slice(11, 16),
      time_end: end.toISOString().slice(11, 16),
      start,
      searching: isSearching(`${title} ${description}`),
    });
  }
  return out;
}

function parseExternalIcs(raw: string): ExternalComparable[] {
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const out: ExternalComparable[] = [];
  let inEvent = false;
  let fields: Record<string, string> = {};

  const flush = () => {
    const startIso = parseIcsDate(fields.DTSTART);
    if (!startIso) return;
    const endIso = parseIcsDate(fields.DTEND) ?? startIso;
    const start = new Date(startIso);
    const end = new Date(endIso);
    const title = fields.SUMMARY ?? "Sin título";
    const description = fields.DESCRIPTION ?? "";
    out.push({
      source_id: fields.UID ?? null,
      title,
      description,
      date: start.toISOString().slice(0, 10),
      time_start: start.toISOString().slice(11, 16),
      time_end: end.toISOString().slice(11, 16),
      start,
      searching: isSearching(`${title} ${description}`),
    });
  };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      fields = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent) flush();
      inEvent = false;
      fields = {};
      continue;
    }
    if (!inEvent) continue;
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).split(";")[0].toUpperCase();
    fields[key] = line.slice(sep + 1).trim();
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
    return new Date(y, m, d).toISOString();
  }
  return asIso(v);
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isLikelyJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function isSearching(text: string): boolean {
  return /\b(lfs|looking for scrim|scrim search|request|buscando|searching|offer)\b/i.test(text);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function minuteDiff(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 60000));
}

function normalizeTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? value : "00:00";
}

function toCompareEvent(ev: ExternalComparable): CompareEvent {
  return {
    source_id: ev.source_id,
    title: ev.title,
    description: ev.description,
    date: ev.date,
    time_start: ev.time_start,
    time_end: ev.time_end,
    searching: ev.searching,
  };
}

function EventList({
  title,
  emptyText,
  events,
  icon,
}: {
  title: string;
  emptyText: string;
  events: CompareEvent[];
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20">
      <div className="px-3 py-2 text-xs font-medium flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className="divide-y divide-border/50">
        {events.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">{emptyText}</div>
        )}
        {events.slice(0, 20).map((ev, idx) => (
          <div key={`${ev.source_id ?? "ev"}-${idx}`} className="px-3 py-2 text-[11px]">
            <div className="font-medium">{ev.title}</div>
            <div className="text-muted-foreground">
              {ev.date} · {ev.time_start} - {ev.time_end}
            </div>
          </div>
        ))}
        {events.length > 20 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            +{events.length - 20} eventos más
          </div>
        )}
      </div>
    </div>
  );
}
