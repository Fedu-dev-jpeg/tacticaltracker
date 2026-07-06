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
    const { data, error } = await supabase.functions.invoke("pracc-compare", {
      body: { feed_url: url, days_back: 30, days_forward: 45 },
    });
    setLoading(false);
    if (error) {
      toast.error("No se pudo comparar", { id: t, description: error.message });
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error("No se pudo comparar", { id: t, description: (data as { error: string }).error });
      return;
    }
    setResult(data as CompareResult);
    toast.success("Comparación lista", { id: t });
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
