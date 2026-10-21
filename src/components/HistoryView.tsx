import { useState, useMemo, useEffect } from "react";
import { Match, MAPS, MATCH_TYPES, MapName, MatchType } from "@/types/match";
import { isWin } from "@/hooks/useMatches";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { Download, Trash2, Search, Pencil, X, BarChart3, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import TrainingForm from "@/components/TrainingForm";
import MatchStatsDialog, { DemoData } from "@/components/MatchStatsDialog";

interface HistoryProps {
  matches: Match[];
  statsFromDate: string | null;
  onStatsFromDateChange: (next: string | null) => Promise<void>;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Match>) => void;
  onExport: () => string;
  onImport: (data: Match[]) => void;
}

export default function HistoryView({
  matches,
  statsFromDate,
  onStatsFromDateChange,
  onDelete,
  onUpdate,
  onExport,
  onImport,
}: HistoryProps) {
  const { isAdmin } = useUserRole();
  const [filterMap, setFilterMap] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterResult, setFilterResult] = useState<string>("all");
  const [eraMode, setEraMode] = useState<"current" | "all">("current");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"date" | "map" | "score">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [draftFromDate, setDraftFromDate] = useState(statsFromDate ?? "");
  const [savingEra, setSavingEra] = useState(false);

  useEffect(() => {
    setDraftFromDate(statsFromDate ?? "");
  }, [statsFromDate]);

  const filtered = useMemo(() => {
    let result = [...matches];
    if (eraMode === "current" && statsFromDate) {
      result = result.filter((m) => m.date.slice(0, 10) >= statsFromDate);
    }
    if (filterMap !== "all") result = result.filter((m) => m.map === filterMap);
    if (filterType !== "all") result = result.filter((m) => m.type === filterType);
    if (filterResult === "win") result = result.filter(isWin);
    if (filterResult === "loss") result = result.filter((m) => !isWin(m));
    if (search) result = result.filter((m) => m.rival.toLowerCase().includes(search.toLowerCase()) || m.notes.toLowerCase().includes(search.toLowerCase()));

    result.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date") cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortCol === "map") cmp = a.map.localeCompare(b.map);
      else cmp = (a.scoreUs - a.scoreThem) - (b.scoreUs - b.scoreThem);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [matches, filterMap, filterType, filterResult, search, sortCol, sortDir, eraMode, statsFromDate]);

  const saveEraDate = async () => {
    setSavingEra(true);
    try {
      await onStatsFromDateChange(draftFromDate.trim() || null);
      toast.success(draftFromDate.trim() ? "Fecha de stats actualizada" : "Filtro de fecha quitado");
    } catch (error) {
      toast.error("No se pudo guardar la fecha", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingEra(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Fecha", "Tipo", "Mapa", "Rival", "Score", "CT Pistol", "CT 2nd", "TR Pistol", "TR 2nd", "Lado Inicial", "Notas"];
    const rows = filtered.map((m) => [
      format(new Date(m.date), "dd/MM/yyyy"),
      m.type, m.map, m.rival, `${m.scoreUs}-${m.scoreThem}`,
      m.ctPistol, m.ctSecondRound, m.trPistol, m.trSecondRound, m.startingSide, `"${m.notes}"`
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hambrientos_historial.csv";
    a.click();
    toast.success("CSV exportado");
  };

  const handleExportJSON = () => {
    const blob = new Blob([onExport()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hambrientos_backup.json";
    a.click();
    toast.success("Backup JSON exportado");
  };

  const handleImportJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          onImport(data);
          toast.success(`${data.length} partidos importados`);
        } catch {
          toast.error("Archivo inválido");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleEditSubmit = (data: Omit<Match, "id">) => {
    if (!editingMatch) return;
    onUpdate(editingMatch.id, data);
    setEditingMatch(null);
    toast.success("Partido actualizado");
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Edit dialog */}
      <Dialog open={!!editingMatch} onOpenChange={(open) => { if (!open) setEditingMatch(null); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Pencil className="h-4 w-4 text-accent" /> Editar partido
            </DialogTitle>
            <DialogDescription>
              Corregí los detalles del partido: score, mapa, rival, tipo (Treino / Scrim / Oficial) y las pistols.
            </DialogDescription>
          </DialogHeader>
          {editingMatch && (
            <TrainingForm onSubmit={handleEditSubmit} initialData={editingMatch} />
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-accent/25 bg-accent/5 p-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-heading font-semibold">
              <CalendarRange className="h-4 w-4 text-accent" />
              Historial / era de stats
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dashboard, Stats y Mapas usan partidos desde la fecha de era. El historial puede mostrar la era actual o todo.
              {statsFromDate
                ? ` Era actual: ${format(new Date(`${statsFromDate}T12:00:00`), "dd/MM/yyyy")}.`
                : " Sin fecha de corte (todo cuenta)."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={eraMode === "current" ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setEraMode("current")}
            >
              Era actual
            </Button>
            <Button
              type="button"
              size="sm"
              variant={eraMode === "all" ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setEraMode("all")}
            >
              Todo el historial
            </Button>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Stats desde</Label>
              <Input
                type="date"
                className="h-8 w-[170px]"
                value={draftFromDate || statsFromDate || ""}
                onChange={(e) => setDraftFromDate(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={saveEraDate} disabled={savingEra}>
              Guardar fecha
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={savingEra || (!statsFromDate && !draftFromDate)}
              onClick={async () => {
                setDraftFromDate("");
                setSavingEra(true);
                try {
                  await onStatsFromDateChange(null);
                  toast.success("Sin fecha de corte");
                } catch (error) {
                  toast.error("No se pudo quitar la fecha", {
                    description: error instanceof Error ? error.message : undefined,
                  });
                } finally {
                  setSavingEra(false);
                }
              }}
            >
              Quitar corte
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar rival o notas..." className="pl-9" />
        </div>
        <Select value={filterMap} onValueChange={setFilterMap}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Mapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {MAPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {MATCH_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterResult} onValueChange={setFilterResult}>
          <SelectTrigger className="w-28"><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="win">Win</SelectItem>
            <SelectItem value="loss">Loss</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportJSON}><Download className="h-4 w-4 mr-1" />Backup JSON</Button>
        <Button variant="outline" size="sm" onClick={handleImportJSON}>Importar JSON</Button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-x-auto card-glow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("date")}>Fecha {sortCol === "date" && (sortDir === "desc" ? "↓" : "↑")}</th>
              <th className="text-left py-3 px-3">Tipo</th>
              <th className="text-left py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("map")}>Mapa {sortCol === "map" && (sortDir === "desc" ? "↓" : "↑")}</th>
              <th className="text-left py-3 px-3">Rival</th>
              <th className="text-center py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort("score")}>Score {sortCol === "score" && (sortDir === "desc" ? "↓" : "↑")}</th>
              <th className="text-center py-3 px-3">W/L</th>
              <th className="text-center py-3 px-3">CT P</th>
              <th className="text-center py-3 px-3">TR P</th>
              <th className="py-3 px-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin partidos</td></tr>
            ) : filtered.map((m) => {
              const win = isWin(m);
              return (
                <tr key={m.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-2.5 px-3">{format(new Date(m.date), "dd/MM/yy")}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{m.type}</td>
                  <td className="py-2.5 px-3 font-medium">{m.map}</td>
                  <td className="py-2.5 px-3 text-muted-foreground max-w-[120px] truncate">{m.rival || "—"}</td>
                  <td className="text-center py-2.5 px-3 font-mono font-semibold">{m.scoreUs}-{m.scoreThem}</td>
                  <td className={cn("text-center py-2.5 px-3 font-bold", win ? "text-success" : "text-destructive")}>{win ? "W" : "L"}</td>
                  <td className={cn("text-center py-2.5 px-3 text-xs", m.ctPistol === "WIN" ? "text-success" : "text-destructive")}>{m.ctPistol === "WIN" ? "✓" : "✗"}</td>
                  <td className={cn("text-center py-2.5 px-3 text-xs", m.trPistol === "WIN" ? "text-success" : "text-destructive")}>{m.trPistol === "WIN" ? "✓" : "✗"}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-center gap-2">
                      {m.demo_data ? (
                        <MatchStatsDialog
                          data={m.demo_data as DemoData}
                          mode="stored"
                          meta={{ date: m.date, matchType: m.type, rival: m.rival, savedAt: m.date, scoreUs: m.scoreUs, scoreThem: m.scoreThem }}
                          trigger={
                            <button className="text-muted-foreground hover:text-accent transition-colors" title="Ver stats (demo parseada)">
                              <BarChart3 className="h-4 w-4" />
                            </button>
                          }
                        />
                      ) : (
                        <button disabled className="text-muted-foreground/40 cursor-not-allowed" title="Sin demo parseada">
                          <BarChart3 className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => setEditingMatch(m)} className="text-muted-foreground hover:text-accent transition-colors" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => { onDelete(m.id); toast.success("Registro eliminado"); }} className="text-muted-foreground hover:text-destructive transition-colors" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} partidos mostrados</p>
    </div>
  );
}
