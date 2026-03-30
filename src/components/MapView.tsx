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

  return (
    <div className="space-y-6 animate-slide-up">
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
