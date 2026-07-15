import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ExternalLink, Loader2, Star, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type FaceitLeagueResponse = {
  configured?: boolean;
  reason?: string;
  team?: {
    id: string;
    name: string;
    avatar: string | null;
    members: number | null;
  };
  competition?: {
    id: string;
    season_id?: string | null;
    name: string;
    status: string | null;
    region: string | null;
  } | null;
  record?: {
    wins: number;
    losses: number;
  } | null;
  matches?: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    opponent: string;
    score: string | null;
    won: boolean;
  }>;
  setup?: {
    env: string;
    teamSettings: string[];
    api: string;
  };
  linksConfigured?: boolean;
  publicOnly?: boolean;
  error?: string;
};

export default function FaceitLeagueCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["faceit-league-results"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("faceit-league-results");
      if (error) throw error;
      return data as FaceitLeagueResponse;
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <LeagueShell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Leyendo FACEIT / ESEA...
        </div>
      </LeagueShell>
    );
  }

  if (!data?.configured) {
    return (
      <LeagueShell>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-accent">ESEA League</div>
            <div className="mt-1 text-lg font-heading font-bold">Conexión FACEIT disponible</div>
            <p className="mt-2 max-w-xl text-xs text-muted-foreground">
              {data?.reason ?? "Falta configuración para consultar resultados reales."}
            </p>
            <div className="mt-3 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <span>Links: <strong className={data?.linksConfigured ? "text-success" : "text-foreground"}>{data?.linksConfigured ? "configurados" : "pendientes"}</strong></span>
              <span>Secret requerido: <strong className="text-foreground">FACEIT_API_KEY</strong></span>
              <span>Team ID: <strong className="text-foreground">{data?.team?.id ?? "pendiente"}</strong></span>
              <span>League: <strong className="text-foreground">{data?.competition?.name ?? "ESEA League"}</strong></span>
              <span className="sm:col-span-2">Para resultados exactos puede hacer falta <strong className="text-foreground">faceit_championship_id</strong>.</span>
            </div>
          </div>
          <Star className="h-10 w-10 shrink-0 text-accent/70" />
        </div>
      </LeagueShell>
    );
  }

  const record = data.record ?? null;
  const latest = data.matches?.[0];

  return (
    <LeagueShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-accent">
            {data.competition?.name ?? "ESEA League"}
          </div>
          <div className="mt-1 text-xs font-semibold text-foreground">
            {data.competition?.status ?? "League"}{data.competition?.region ? ` / ${data.competition.region}` : ""}
          </div>
          {record ? (
            <div className="mt-3 text-3xl font-heading font-bold">
              <span className="text-success">{record.wins}</span>
              <span className="mx-2 text-muted-foreground">-</span>
              <span className="text-destructive">{record.losses}</span>
            </div>
          ) : (
            <div className="mt-3 inline-flex rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-mono uppercase tracking-[0.12em] text-accent">
              {data.publicOnly ? "API key requerida para resultado" : "Sin resultados"}
            </div>
          )}
        </div>
        <Star className="h-10 w-10 shrink-0 text-accent" />
      </div>

      <div className="my-4 h-px bg-border" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-accent/30 bg-accent/10">
            {data.team?.avatar ? (
              <img src={data.team.avatar} alt={data.team.name} className="h-full w-full object-cover" />
            ) : (
              <Trophy className="h-4 w-4 text-accent" />
            )}
          </div>
          <div>
            <div className="text-sm font-heading font-bold">{data.team?.name ?? "Equipo FACEIT"}</div>
            <div className="text-xs text-muted-foreground">{data.team?.members ?? "-"} miembros</div>
          </div>
        </div>
        {latest && (
          <div className="text-right">
            <div className={cn("text-sm font-bold", latest.won ? "text-success" : "text-destructive")}>
              {latest.score ?? latest.status}
            </div>
            <div className="max-w-[160px] truncate text-xs text-muted-foreground">vs {latest.opponent}</div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        {data.publicOnly ? "Equipo via FACEIT público · Resultados requieren API" : "Datos via FACEIT Data API"}
      </div>
    </LeagueShell>
  );
}

function LeagueShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5 card-glow">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-accent/10 blur-xl" />
      <div className="relative">{children}</div>
    </div>
  );
}
