import type { ReactNode } from "react";
import { Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/match";
import { isWin } from "@/hooks/useMatches";

function isEseaOfficial(match: Match) {
  const text = `${match.type} ${match.rival} ${match.notes} ${match.tournamentName ?? ""}`.toLowerCase();
  return match.type === "Oficial" && (text.includes("esea") || text.includes("hacha") || text.includes("league"));
}

export default function FaceitLeagueCard({ matches }: { matches: Match[] }) {
  const eseaMatches = matches.filter(isEseaOfficial);
  const wins = eseaMatches.filter(isWin).length;
  const losses = eseaMatches.filter((match) => !isWin(match)).length;
  const latest = [...eseaMatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return (
    <LeagueShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-accent">
            ESEA League
          </div>
          <div className="mt-1 text-xs font-semibold text-foreground">
            Open
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">S58 / Regular Season</div>
          <div className="mt-3 text-3xl font-heading font-bold">
            <span className="text-success">{wins}</span>
            <span className="mx-2 text-muted-foreground">-</span>
            <span className="text-foreground">{losses}</span>
          </div>
        </div>
        <Star className="h-10 w-10 shrink-0 text-accent" />
      </div>

      <div className="my-4 h-px bg-border" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-accent/30 bg-accent/10">
            <Trophy className="h-4 w-4 text-accent" />
          </div>
          <div>
            <div className="text-sm font-heading font-bold">Tactical Chaos 🇦🇷</div>
            <div className="text-xs text-muted-foreground">8 miembros</div>
          </div>
        </div>
        {latest && (
          <div className="text-right">
            <div className={cn("text-sm font-bold", isWin(latest) ? "text-success" : "text-destructive")}>
              {latest.scoreUs} - {latest.scoreThem}
            </div>
            <div className="max-w-[160px] truncate text-xs text-muted-foreground">vs {latest.rival}</div>
          </div>
        )}
      </div>
    </LeagueShell>
  );
}

function LeagueShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-square max-w-[260px] overflow-hidden rounded-lg border border-border bg-card p-5 card-glow">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-accent/10 blur-xl" />
      <div className="relative">{children}</div>
    </div>
  );
}
