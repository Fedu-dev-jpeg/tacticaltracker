import { useMemo, useState } from "react";
import { Match, MAPS, MapName } from "@/types/match";
import { isWin, getWinRate, getPistolRate, getConversionRate } from "@/hooks/useMatches";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Download } from "lucide-react";
import { toast } from "sonner";

interface MapViewProps {
  matches: Match[];
}

export default function MapView({ matches }: MapViewProps) {
  const [selectedMap, setSelectedMap] = useState<MapName>("Nuke");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const mapMatches = matches.filter((m) => m.map === selectedMap);

  const sortedTable = useMemo(() => {
    return [...mapMatches].sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortDir === "desc" ? -diff : diff;
    });
  }, [mapMatches, sortDir]);

  const winRate = getWinRate(mapMatches);
  const ctP = getPistolRate(mapMatches, "CT");
  const trP = getPistolRate(mapMatches, "TR");
  const ctC = getConversionRate(mapMatches, "CT");
  const trC = getConversionRate(mapMatches, "TR");

  const allNotes = mapMatches.filter((m) => m.notes).map((m) => m.notes);

  const overview = MAPS.map((map) => {
    const mm = matches.filter((m) => m.map === map);
    const w = mm.filter(isWin).length;
    const l = mm.length - w;
    const wr = getWinRate(mm);
    return { map, played: mm.length, w, l, wr };
  });
  const maxPlayed = Math.max(1, ...overview.map((o) => o.played));

  const handleExportMapCSV = () => {
    if (sortedTable.length === 0) {
      toast.error("Sin partidos para exportar");
      return;
    }
    const headers = ["Fecha", "Tipo", "Rival", "Score Us", "Score Them", "W/L", "CT Pistol", "TR Pistol", "Lado Inicial", "Notas"];
    const rows = sortedTable.map((m) => [
      format(new Date(m.date), "dd/MM/yyyy"),
      m.type,
      m.rival,
      m.scoreUs,
      m.scoreThem,
      isWin(m) ? "W" : "L",
      m.ctPistol,
      m.trPistol,
      m.startingSide,
      `"${(m.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hambrientos_${selectedMap.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV de ${selectedMap} exportado`);
  };

  return (
    <TooltipProvider delayDuration={100}>
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
              const wrText = o.wr >= 60 ? "text-success" : o.wr >= 45 ? "text-accent" : "text-destructive";
              const tooltipContent = (
                <div className="space-y-1 text-xs">
                  <div className="font-heading font-bold text-sm">{o.map}</div>
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Jugados</span><span className="tabular-nums font-semibold">{o.played}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-success">Wins</span><span className="tabular-nums font-semibold text-success">{o.w}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-destructive">Losses</span><span className="tabular-nums font-semibold text-destructive">{o.l}</span></div>
                  <div className="flex justify-between gap-4 border-t border-border/40 pt-1 mt-1"><span className="text-muted-foreground">Win%</span><span className={cn("tabular-nums font-bold", wrText)}>{o.played ? `${o.wr}%` : "—"}</span></div>
                </div>
              );
              return (
                <Tooltip key={o.map}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelectedMap(o.map)}
                      className={cn(
                        "w-full grid grid-cols-[110px,50px,1fr,1fr,70px] items-center gap-3 rounded-md border p-3 text-left transition-colors touch-manipulation",
                        selectedMap === o.map ? "border-accent bg-accent/5" : "border-border hover:border-muted-foreground/40",
                      )}
                    >
                      <div className="font-heading font-bold text-sm">{o.map}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{o.played}p</div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div className="h-full bg-accent/70" style={{ width: `${playedPct}%` }} />
                      </div>
                      {o.played === 0 ? (
                        <div className="h-2 rounded-full bg-muted/40" />
                      ) : (
                        <div className="h-2 rounded-full overflow-hidden flex">
                          <div className="h-full bg-success" style={{ width: `${wPct}%` }} />
                          <div className="h-full bg-destructive" style={{ width: `${lPct}%` }} />
                        </div>
                      )}
                      <div className={cn("text-right font-heading font-bold text-sm tabular-nums", o.played ? wrText : "text-muted-foreground")}>
                        {o.played ? `${o.wr}%` : "—"}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-popover border-border">
                    {tooltipContent}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-accent/70" /> Volumen</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Wins</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> Losses</span>
            <span className="ml-auto normal-case tracking-normal text-[11px] text-muted-foreground/70">Hover/tap para ver detalles</span>
          </div>
        </div>

        {/* Sortable table with CSV export for selected map */}
        <div className="bg-card rounded-lg border border-border p-6 card-glow">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-heading font-bold">Partidas en {selectedMap}</h3>
            <Button variant="outline" size="sm" onClick={handleExportMapCSV} disabled={sortedTable.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
          {sortedTable.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Sin partidos en este mapa</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground uppercase tracking-widest text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2">
                      <button onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        Fecha <ArrowUpDown className="h-3 w-3" />
                        <span className="text-accent normal-case tracking-normal text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>
                      </button>
                    </th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Rival</th>
                    <th className="text-center px-3 py-2">Score</th>
                    <th className="text-center px-3 py-2">W/L</th>
                    <th className="text-center px-3 py-2">CT P</th>
                    <th className="text-center px-3 py-2">TR P</th>
                    <th className="text-left px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.map((m) => {
                    const win = isWin(m);
                    return (
                      <tr key={m.id} className="border-t border-border/40 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5 tabular-nums">{format(new Date(m.date), "dd/MM/yy")}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{m.type}</td>
                        <td className="px-3 py-2.5 max-w-[160px] truncate">{m.rival || "—"}</td>
                        <td className={cn("px-3 py-2.5 text-center font-mono font-semibold", win ? "text-success" : "text-destructive")}>{m.scoreUs}-{m.scoreThem}</td>
                        <td className={cn("px-3 py-2.5 text-center font-bold", win ? "text-success" : "text-destructive")}>{win ? "W" : "L"}</td>
                        <td className={cn("px-3 py-2.5 text-center text-xs", m.ctPistol === "WIN" ? "text-success" : "text-destructive")}>{m.ctPistol === "WIN" ? "✓" : "✗"}</td>
                        <td className={cn("px-3 py-2.5 text-center text-xs", m.trPistol === "WIN" ? "text-success" : "text-destructive")}>{m.trPistol === "WIN" ? "✓" : "✗"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[240px] truncate" title={m.notes}>{m.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">{sortedTable.length} partidas · orden por fecha {sortDir === "desc" ? "descendente" : "ascendente"}</p>
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
    </TooltipProvider>
  );
}
