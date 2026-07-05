import { useState } from "react";
import { Match, MAPS, MapName } from "@/types/match";
import { isWin, getWinRate, getPistolRate, getConversionRate } from "@/hooks/useMatches";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MapViewProps {
  matches: Match[];
}

export default function MapView({ matches }: MapViewProps) {
  const [selectedMap, setSelectedMap] = useState<MapName>("Nuke");
  const mapMatches = matches.filter((m) => m.map === selectedMap);
  const sorted = [...mapMatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const winRate = getWinRate(mapMatches);
  const ctP = getPistolRate(mapMatches, "CT");
  const trP = getPistolRate(mapMatches, "TR");
  const ctC = getConversionRate(mapMatches, "CT");
  const trC = getConversionRate(mapMatches, "TR");

  // Recurring notes
  const allNotes = mapMatches.filter((m) => m.notes).map((m) => m.notes);

  const overview = MAPS.map((map) => {
    const mm = matches.filter((m) => m.map === map);
    const w = mm.filter(isWin).length;
    const l = mm.length - w;
    const wr = getWinRate(mm);
    return { map, played: mm.length, w, l, wr };
  });
  const maxPlayed = Math.max(1, ...overview.map((o) => o.played));

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Per-map overview */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground mb-4">
          Resumen por mapa
        </h3>
        <div className="space-y-3">
          {overview.map((o) => {
            const wPct = o.played ? (o.w / o.played) * 100 : 0;
            const lPct = o.played ? (o.l / o.played) * 100 : 0;
            const playedPct = (o.played / maxPlayed) * 100;
            const wrColor = o.wr >= 60 ? "bg-success" : o.wr >= 45 ? "bg-accent" : "bg-destructive";
            const wrText = o.wr >= 60 ? "text-success" : o.wr >= 45 ? "text-accent" : "text-destructive";
            return (
              <button
                key={o.map}
                onClick={() => setSelectedMap(o.map)}
                className={cn(
                  "w-full grid grid-cols-[110px,50px,1fr,1fr,70px] items-center gap-3 rounded-md border p-3 text-left transition-colors",
                  selectedMap === o.map ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground/40",
                )}
              >
                <div className="font-heading font-bold text-sm">{o.map}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{o.played}p</div>
                {/* Games played bar */}
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden" title={`${o.played} partidos`}>
                  <div className="h-full bg-accent/70" style={{ width: `${playedPct}%` }} />
                </div>
                {/* W/L split bar */}
                {o.played === 0 ? (
                  <div className="h-2 rounded-full bg-muted/40" />
                ) : (
                  <div className="h-2 rounded-full overflow-hidden flex" title={`${o.w}W · ${o.l}L`}>
                    <div className="h-full bg-success" style={{ width: `${wPct}%` }} />
                    <div className="h-full bg-destructive" style={{ width: `${lPct}%` }} />
                  </div>
                )}
                <div className={cn("text-right font-heading font-bold text-sm tabular-nums", o.played ? wrText : "text-muted-foreground")}>
                  {o.played ? `${o.wr}%` : "—"}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-accent/70" /> Volumen</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Wins</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> Losses</span>
        </div>
      </div>

      {/* Map selector */}
      <div className="flex gap-2 flex-wrap">
        {MAPS.map((map) => {
          const mm = matches.filter((m) => m.map === map);
          const wr = getWinRate(mm);
          return (
            <button
              key={map}
              onClick={() => setSelectedMap(map)}
              className={cn(
                "px-5 py-3 rounded-lg font-heading font-bold text-sm transition-all border",
                selectedMap === map
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
              )}
            >
              {map}
              <span className="block text-xs font-body font-normal mt-0.5">
                {mm.length}p · {wr}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-success" : "text-destructive" },
          { label: "CT Pistol", value: `${ctP}%`, color: ctP >= 50 ? "text-success" : "text-destructive" },
          { label: "TR Pistol", value: `${trP}%`, color: trP >= 50 ? "text-success" : "text-destructive" },
          { label: "CT 2nd Rnd", value: `${ctC}%`, color: ctC >= 60 ? "text-success" : "text-accent" },
          { label: "TR 2nd Rnd", value: `${trC}%`, color: trC >= 60 ? "text-success" : "text-accent" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-lg border border-border p-4 text-center card-glow">
            <p className="stat-label">{s.label}</p>
            <p className={cn("stat-value", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Match history for this map */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Partidos en {selectedMap}</h3>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">Sin partidos en este mapa</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((m) => {
              const win = isWin(m);
              return (
                <div key={m.id} className={cn("flex items-center gap-3 p-3 rounded-lg border", win ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5")}>
                  <span className={cn("font-bold text-sm w-6", win ? "text-success" : "text-destructive")}>{win ? "W" : "L"}</span>
                  <span className="font-mono font-semibold text-sm">{m.scoreUs}-{m.scoreThem}</span>
                  <span className="text-muted-foreground text-sm flex-1">{m.rival || "—"}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(m.date), "dd/MM/yy")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      {allNotes.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-6 card-glow">
          <h3 className="text-lg font-heading font-bold mb-4">Notas en {selectedMap}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {allNotes.map((n, i) => (
              <li key={i} className="border-l-2 border-accent/50 pl-3">"{n}"</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
