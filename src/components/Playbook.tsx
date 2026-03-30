import { useState, useEffect, useMemo } from "react";
import { MAPS, MapName, PLAYERS } from "@/types/match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronUp, Shield, Sword, Link as LinkIcon, FileDown, Check, Copy, Pencil, MessageSquare, User, X } from "lucide-react";
import { toast } from "sonner";

const PLAYER_DESCRIPTIONS: Record<string, string> = {
  Froud: "AWPer principal · Líder táctico",
  Fedu: "Soporte · Utility master",
  Hanzo: "Entry fragger · Agresivo",
  Diuva: "Anchor / Site player · Clutch",
  Gyer: "Flex / Rotador · Segundo entry",
};

export interface Strategy {
  id: string;
  map: MapName;
  side: "CT" | "TR";
  type: string;
  name: string;
  description: string;
  playerRoles: Record<string, string>;
  notes: string;
  link: string;
  status: "Draft" | "Ready" | "Probado";
}

const STRAT_TYPE_ORDER = ["Pistol", "Anti-Eco", "Forzado", "Default", "Exec", "Dominio", "Retake", "Postplant", "Calls de base", "Sorpresa"];
const STRAT_TYPES = [...STRAT_TYPE_ORDER];

const CODEWORDS = [
  { word: "Contacto", desc: "Buscar contacto con el enemigo para obtener info y abrir el round" },
  { word: "Pop", desc: "Flash pop coordinada para entrar a un site o tomar control de zona" },
  { word: "Hero", desc: "Jugada individual agresiva — un jugador busca hacer una play de impacto" },
  { word: "Sólidos", desc: "Jugar posiciones default seguras, no peekear innecesariamente, ganar por economía" },
  { word: "Pausa / Freeze", desc: "Frenar la ejecución, esperar info, no commitear hasta nuevo call" },
  { word: "Marotei", desc: "Rotación rápida al otro site, fakeando presencia en el actual" },
  { word: "Deathmatch", desc: "Round suelto sin estructura — cada uno busca su duelo, usado en ecos o últimas rondas" },
];

const STORAGE_KEY = "hambrientos_playbook";

function loadStrategies(): Strategy[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : getDefaultStrategies();
  } catch {
    return getDefaultStrategies();
  }
}

function getDefaultStrategies(): Strategy[] {
  return [
    { id: "def-1", map: "Nuke", side: "TR", type: "Default", name: "Lobby Split", description: "Default con control de lobby. Hanzo lobby, Froud AWP outside, Diuva door/silo, Gyer rotador, Fedu soporte.", playerRoles: { Hanzo: "Lobby", Froud: "AWP", Diuva: "Outside", Gyer: "Door/Silo", Fedu: "Rotador" }, notes: "Ganar info de ramp antes de commitear", link: "", status: "Ready" },
    { id: "def-2", map: "Nuke", side: "CT", type: "Default", name: "Ramp Control", description: "Setup CT con foco en mantener ramp. Diuva ramp, Hanzo A anchor, Froud door/main, Fedu outside, Froud AWP.", playerRoles: { Diuva: "Ramp", Hanzo: "A Anchor", Froud: "AWP", Fedu: "Outside", Gyer: "Door/Main" }, notes: "Rotación rápida si pierden ramp", link: "", status: "Ready" },
    { id: "def-3", map: "Inferno", side: "TR", type: "Default", name: "Banana Aggro", description: "Control agresivo de banana con Hanzo aggro y Fedu soporte. AWP Froud desde T spawn.", playerRoles: { Hanzo: "Banana Aggro", Fedu: "Banana Supp", Froud: "AWP", Gyer: "Boiler", Diuva: "Apps" }, notes: "Molly car, smoke CT, progresar con flashes", link: "", status: "Ready" },
    { id: "def-4", map: "Ancient", side: "TR", type: "Exec", name: "B Split Mid", description: "Split B desde mid. Diuva outside B, Gyer mid aggro, Froud AWP, Hanzo outside A como lurk.", playerRoles: { Diuva: "Outside B", Gyer: "Mid Aggro", Froud: "AWP", Hanzo: "Outside A", Fedu: "Roamer" }, notes: "Timing importante con smokes de mid", link: "", status: "Draft" },
    { id: "def-5", map: "Anubis", side: "CT", type: "Retake", name: "B Retake 3-man", description: "Retake B con 3 jugadores desde mid y connector. Utility coordinada.", playerRoles: { Froud: "AWP Mid", Hanzo: "Entry", Diuva: "Soporte", Fedu: "Anchor A", Gyer: "Info Canal" }, notes: "No retakear sin al menos 2 flashes", link: "", status: "Draft" },
    { id: "def-6", map: "Nuke", side: "TR", type: "Pistol", name: "Lobby Rush", description: "Rush rápido por lobby con flashes coordinadas.", playerRoles: { Hanzo: "Entry", Froud: "Flash", Diuva: "Second", Gyer: "Trade", Fedu: "Lurk Outside" }, notes: "Timing con la primera flash es clave", link: "", status: "Ready" },
    { id: "def-7", map: "Nuke", side: "CT", type: "Pistol", name: "Stack Ramp", description: "3 jugadores ramp para ganar control agresivo.", playerRoles: { Diuva: "Ramp Entry", Hanzo: "Flash", Froud: "Heaven AWP", Fedu: "Outside", Gyer: "Ramp Support" }, notes: "Si pierden ramp retomar con utility", link: "", status: "Probado" },
    { id: "def-8", map: "Inferno", side: "CT", type: "Default", name: "B Anchor + Apps", description: "Setup clásico con Diuva pit, Hanzo apps hold.", playerRoles: { Diuva: "Pit", Hanzo: "Apps", Froud: "AWP Mid", Fedu: "B Anchor", Gyer: "Short" }, notes: "Rotación por CT spawn si pierden banana", link: "", status: "Ready" },
  ];
}

function sortByType(strats: Strategy[]): Strategy[] {
  return [...strats].sort((a, b) => {
    const ai = STRAT_TYPE_ORDER.indexOf(a.type);
    const bi = STRAT_TYPE_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export default function Playbook() {
  const [strategies, setStrategies] = useState<Strategy[]>(loadStrategies);
  const [selectedMap, setSelectedMap] = useState<MapName>("Nuke");
  const [selectedSide, setSelectedSide] = useState<"CT" | "TR" | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStrat, setEditingStrat] = useState<Strategy | null>(null);
  const [gameplanMode, setGameplanMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gameplanMap, setGameplanMap] = useState<MapName | "all">("all");
  const [showCodewords, setShowCodewords] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const ensureProtocol = (url: string) => {
    if (!url) return url;
    if (url.match(/^https?:\/\//i)) return url;
    return `https://${url}`;
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  }, [strategies]);

  const filtered = useMemo(() => {
    const f = strategies.filter((s) => {
      if (s.map !== selectedMap) return false;
      if (selectedSide !== "all" && s.side !== selectedSide) return false;
      if (selectedPlayer && !s.playerRoles[selectedPlayer]) return false;
      return true;
    });
    return sortByType(f);
  }, [strategies, selectedMap, selectedSide, selectedPlayer]);

  const ctStrats = filtered.filter((s) => s.side === "CT");
  const trStrats = filtered.filter((s) => s.side === "TR");

  const deleteStrat = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    toast.success("Estrategia eliminada");
  };

  const duplicateStrat = (strat: Strategy) => {
    const dup: Strategy = { ...strat, id: crypto.randomUUID(), name: `${strat.name} (copia)`, status: "Draft", playerRoles: { ...strat.playerRoles } };
    setStrategies((prev) => [dup, ...prev]);
    toast.success("Estrategia duplicada");
  };

  const startEdit = (strat: Strategy) => {
    setEditingStrat({ ...strat, playerRoles: { ...strat.playerRoles } });
    setShowForm(false);
    setExpandedId(null);
  };

  const saveEdit = (updated: Strategy) => {
    setStrategies((prev) => prev.map((s) => s.id === updated.id ? updated : s));
    setEditingStrat(null);
    toast.success("Estrategia actualizada");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedStrats = useMemo(() => {
    const selected = strategies.filter((s) => selectedIds.has(s.id));
    if (gameplanMap !== "all") return sortByType(selected.filter((s) => s.map === gameplanMap));
    return sortByType(selected);
  }, [strategies, selectedIds, gameplanMap]);

  const handleExportPDF = async () => {
    if (selectedIds.size === 0) { toast.error("Seleccioná al menos una estrategia"); return; }
    const byMap: Record<string, Strategy[]> = {};
    selectedStrats.forEach((s) => { if (!byMap[s.map]) byMap[s.map] = []; byMap[s.map].push(s); });

    const mapSections = Object.entries(byMap).map(([map, strats]) => {
      const ctS = sortByType(strats.filter((s) => s.side === "CT"));
      const trS = sortByType(strats.filter((s) => s.side === "TR"));
      const renderStrat = (s: Strategy) => `
        <div style="margin-bottom:14px;page-break-inside:avoid;border:1px solid #333;border-radius:6px;padding:12px;background:#1a1a2e;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="background:${s.side === 'CT' ? '#1F4E79' : '#ED7D31'};color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;font-weight:bold;">${s.side}</span>
            <span style="background:#333;color:#aaa;font-size:10px;padding:2px 6px;border-radius:3px;">${s.type}</span>
            <strong style="color:#e8e8e8;font-size:13px;">${s.name}</strong>
            <span style="margin-left:auto;font-size:9px;color:${s.status === 'Ready' ? '#70AD47' : s.status === 'Probado' ? '#4a9eff' : '#888'};text-transform:uppercase;">${s.status}</span>
          </div>
          <p style="color:#ccc;font-size:11px;margin:0 0 8px;">${s.description}</p>
          ${Object.keys(s.playerRoles).length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${Object.entries(s.playerRoles).map(([p, r]) => `<span style="font-size:10px;background:#252540;padding:3px 8px;border-radius:4px;color:#ddd;"><strong style="color:#ED7D31;">${p}</strong>: ${r}</span>`).join('')}</div>` : ''}
          ${s.notes ? `<p style="font-size:10px;color:#999;border-left:2px solid #ED7D31;padding-left:8px;margin:4px 0;">${s.notes}</p>` : ''}
        </div>`;
      return `
        <div style="page-break-before:${map === Object.keys(byMap)[0] ? 'auto' : 'always'};">
          <h2 style="color:#ED7D31;font-size:22px;margin:0 0 16px;border-bottom:2px solid #ED7D31;padding-bottom:8px;">📋 ${map}</h2>
          ${ctS.length > 0 ? `<h3 style="color:#1F4E79;font-size:14px;margin:12px 0 8px;">🛡️ CT SIDE</h3>${ctS.map(renderStrat).join('')}` : ''}
          ${trS.length > 0 ? `<h3 style="color:#ED7D31;font-size:14px;margin:12px 0 8px;">⚔️ TR SIDE</h3>${trS.map(renderStrat).join('')}` : ''}
        </div>`;
    }).join('');

    const html = `<html><head><style>@page{size:A4;margin:20mm;}body{font-family:Arial,sans-serif;background:#0f0f23;color:#e8e8e8;margin:0;padding:20px;}@media print{body{background:#0f0f23;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
      <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#ED7D31;font-size:28px;margin:0;">HAMBRIENTOS</h1><p style="color:#888;font-size:12px;margin:4px 0;">GAMEPLAN · ${new Date().toLocaleDateString('es-AR')} · ${selectedIds.size} estrategias</p></div>
      ${mapSections}
      <div style="text-align:center;margin-top:24px;color:#555;font-size:10px;">HAMBRIENTOS CS2 Team · Generado automáticamente</div>
    </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); setTimeout(() => printWindow.print(), 500); }
    toast.success("Gameplan listo para imprimir");
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Codewords Reference */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <button onClick={() => setShowCodewords(!showCodewords)} className="w-full flex items-center gap-2 p-3 hover:bg-secondary/30 transition-colors text-left">
          <MessageSquare className="h-4 w-4 text-accent" />
          <span className="font-heading font-bold text-sm flex-1">Codewords / Callouts</span>
          <span className="text-[10px] text-muted-foreground mr-2">{CODEWORDS.length} calls</span>
          {showCodewords ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showCodewords && (
          <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-border pt-3">
            {CODEWORDS.map((cw) => (
              <div key={cw.word} className="flex items-start gap-2 bg-secondary/40 rounded-md p-2">
                <span className="text-xs font-heading font-bold text-accent bg-accent/10 px-2 py-0.5 rounded shrink-0">{cw.word}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{cw.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player filter */}
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <User className="h-4 w-4 text-accent" />
          <span className="font-heading font-bold text-sm">Playbook Individual</span>
          {selectedPlayer && (
            <button onClick={() => setSelectedPlayer(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Ver todos
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PLAYERS.map((p) => {
            const isActive = selectedPlayer === p;
            const playerStratCount = strategies.filter((s) => s.playerRoles[p]).length;
            return (
              <button
                key={p}
                onClick={() => setSelectedPlayer(isActive ? null : p)}
                className={cn(
                  "flex flex-col items-start px-3 py-2 rounded-lg border transition-all text-left",
                  isActive ? "border-accent bg-accent/10 text-accent" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-foreground/20"
                )}
              >
                <span className="text-xs font-heading font-bold">{p}</span>
                <span className="text-[10px] opacity-70">{PLAYER_DESCRIPTIONS[p]}</span>
                <span className="text-[9px] mt-0.5 opacity-50">{playerStratCount} strats</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map + Side selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {MAPS.map((map) => {
            const count = strategies.filter((s) => s.map === map).length;
            return (
              <button key={map} onClick={() => setSelectedMap(map)} className={cn("px-4 py-2 rounded-lg font-heading font-bold text-sm transition-all border", selectedMap === map ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                {map}<span className="block text-xs font-body font-normal">{count} strats</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["all", "CT", "TR"] as const).map((s) => (
            <button key={s} onClick={() => setSelectedSide(s)} className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-all", selectedSide === s ? s === "CT" ? "bg-primary text-primary-foreground" : s === "TR" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground" : "bg-secondary/50 text-muted-foreground")}>
              {s === "all" ? "Todos" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Gameplan mode */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={gameplanMode ? "default" : "outline"} size="sm" onClick={() => { setGameplanMode(!gameplanMode); if (gameplanMode) setSelectedIds(new Set()); }} className={gameplanMode ? "gradient-accent text-accent-foreground" : ""}>
          <FileDown className="h-4 w-4 mr-1" />{gameplanMode ? `Gameplan (${selectedIds.size})` : "Armar Gameplan"}
        </Button>
        {gameplanMode && (
          <>
            <Select value={gameplanMap} onValueChange={(v) => setGameplanMap(v as MapName | "all")}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos los mapas</SelectItem>{MAPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={() => { const all = new Set(filtered.map((s) => s.id)); setSelectedIds((prev) => { const merged = new Set(prev); all.forEach((id) => merged.add(id)); return merged; }); }} variant="outline" className="h-8 text-xs">
              <Check className="h-3 w-3 mr-1" /> Seleccionar vista
            </Button>
            <Button size="sm" onClick={handleExportPDF} disabled={selectedIds.size === 0} className="gradient-primary text-primary-foreground h-8">
              <FileDown className="h-3 w-3 mr-1" /> Exportar PDF ({selectedIds.size})
            </Button>
          </>
        )}
      </div>

      {/* Edit form */}
      {editingStrat && (
        <StrategyForm
          initialData={editingStrat}
          title="Editar Estrategia"
          submitLabel="Guardar Cambios"
          onSubmit={saveEdit}
          onCancel={() => setEditingStrat(null)}
        />
      )}

      {/* Strategies grouped by side */}
      {!editingStrat && (
        <>
          {(selectedSide === "all" || selectedSide === "CT") && ctStrats.length > 0 && (
            <StratSection title="CT Side" icon={<Shield className="h-5 w-5" />} strats={ctStrats} expandedId={expandedId} setExpandedId={setExpandedId} onDelete={deleteStrat} onDuplicate={duplicateStrat} onEdit={startEdit} gameplanMode={gameplanMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} selectedPlayer={selectedPlayer} ensureProtocol={ensureProtocol} />
          )}
          {(selectedSide === "all" || selectedSide === "TR") && trStrats.length > 0 && (
            <StratSection title="TR Side" icon={<Sword className="h-5 w-5" />} strats={trStrats} expandedId={expandedId} setExpandedId={setExpandedId} onDelete={deleteStrat} onDuplicate={duplicateStrat} onEdit={startEdit} gameplanMode={gameplanMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} selectedPlayer={selectedPlayer} ensureProtocol={ensureProtocol} />
          )}

          {filtered.length === 0 && !showForm && (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-heading">Sin estrategias en {selectedMap}</p>
              <p className="text-sm">Agregá la primera estrategia para este mapa</p>
            </div>
          )}

          {showForm ? (
            <StrategyForm
              initialData={{ id: "", map: selectedMap, side: "TR", type: STRAT_TYPES[0], name: "", description: "", playerRoles: {}, notes: "", link: "", status: "Draft" }}
              title="Nueva Estrategia"
              submitLabel="Guardar"
              onSubmit={(s) => { setStrategies((prev) => [{ ...s, id: crypto.randomUUID() }, ...prev]); setShowForm(false); toast.success("Estrategia agregada"); }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <Button onClick={() => setShowForm(true)} className="gradient-accent text-accent-foreground w-full">
              <Plus className="h-4 w-4 mr-2" /> Agregar Estrategia
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function StratSection({ title, icon, strats, expandedId, setExpandedId, onDelete, onDuplicate, onEdit, gameplanMode, selectedIds, onToggleSelect }: {
  title: string; icon: React.ReactNode; strats: Strategy[]; expandedId: string | null; setExpandedId: (id: string | null) => void;
  onDelete: (id: string) => void; onDuplicate: (s: Strategy) => void; onEdit: (s: Strategy) => void;
  gameplanMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
}) {
  const grouped: Record<string, Strategy[]> = {};
  strats.forEach((s) => { if (!grouped[s.type]) grouped[s.type] = []; grouped[s.type].push(s); });

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-heading font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">{icon} {title}</h3>
      {Object.entries(grouped).map(([type, typeStrats]) => (
        <div key={type} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 pl-1">{type}</p>
          {typeStrats.map((s) => {
            const isExpanded = expandedId === s.id;
            const isSelected = selectedIds.has(s.id);
            const statusColors: Record<string, string> = { Draft: "bg-muted text-muted-foreground", Ready: "bg-success/20 text-success", Probado: "bg-primary/20 text-primary-foreground" };
            return (
              <div key={s.id} className={cn("bg-card rounded-lg border card-glow overflow-hidden transition-all", isSelected ? "border-accent/50 bg-accent/5" : "border-border")}>
                <div className="flex items-center gap-2 p-4">
                  {gameplanMode && <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(s.id)} className="shrink-0" />}
                  <button onClick={() => setExpandedId(isExpanded ? null : s.id)} className="flex items-center gap-3 flex-1 text-left hover:bg-secondary/30 transition-colors rounded">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold uppercase", statusColors[s.status])}>{s.status}</span>
                    <span className="font-heading font-semibold text-sm flex-1">{s.name}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <p className="text-sm text-foreground/90">{s.description}</p>
                    {Object.keys(s.playerRoles).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(s.playerRoles).map(([player, role]) => (
                          <span key={player} className="text-xs bg-secondary rounded-md px-2 py-1"><strong className="text-accent">{player}</strong>: {role}</span>
                        ))}
                      </div>
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground border-l-2 border-accent/50 pl-2">{s.notes}</p>}
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                        <LinkIcon className="h-3 w-3" /> Ver referencia
                      </a>
                    )}
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => onEdit(s)} className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 transition-colors">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button onClick={() => onDuplicate(s)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                        <Copy className="h-3 w-3" /> Duplicar
                      </button>
                      <button onClick={() => onDelete(s.id)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                        <Trash2 className="h-3 w-3" /> Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StrategyForm({ initialData, title, submitLabel, onSubmit, onCancel }: {
  initialData: Strategy; title: string; submitLabel: string;
  onSubmit: (s: Strategy) => void; onCancel: () => void;
}) {
  const [map, setMap] = useState<MapName>(initialData.map);
  const [side, setSide] = useState<"CT" | "TR">(initialData.side);
  const [type, setType] = useState(initialData.type);
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description);
  const [notes, setNotes] = useState(initialData.notes);
  const [link, setLink] = useState(initialData.link);
  const [status, setStatus] = useState<Strategy["status"]>(initialData.status);
  const [playerRoles, setPlayerRoles] = useState<Record<string, string>>({ ...initialData.playerRoles });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { toast.error("Nombre requerido"); return; }
    onSubmit({
      id: initialData.id,
      map, side, type, name, description,
      playerRoles: Object.fromEntries(Object.entries(playerRoles).filter(([, v]) => v)),
      notes, link, status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-accent/30 p-6 space-y-4 card-glow">
      <h3 className="font-heading font-bold text-lg flex items-center gap-2">
        {initialData.id ? <Pencil className="h-5 w-5 text-accent" /> : <Plus className="h-5 w-5 text-accent" />} {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Mapa</Label>
          <Select value={map} onValueChange={(v) => setMap(v as MapName)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MAPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Side</Label>
          <div className="flex gap-1">
            {(["CT", "TR"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)} className={cn("flex-1 py-2 rounded-md text-xs font-semibold transition-all", side === s ? (s === "CT" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground") : "bg-secondary text-muted-foreground")}>{s}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STRAT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Strategy["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Ready">Ready</SelectItem>
              <SelectItem value="Probado">Probado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Nombre</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: B Split con smokes" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Descripción</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción detallada de la estrategia..." rows={3} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Roles por jugador</Label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {PLAYERS.map((p) => (
            <div key={p} className="space-y-1">
              <span className="text-[10px] text-accent font-semibold">{p}</span>
              <Input value={playerRoles[p] || ""} onChange={(e) => setPlayerRoles((prev) => ({ ...prev, [p]: e.target.value }))} placeholder="Rol..." className="h-8 text-xs" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Notas</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tips, timings..." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Link (video/demo)</Label>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="gradient-accent text-accent-foreground flex-1">{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
