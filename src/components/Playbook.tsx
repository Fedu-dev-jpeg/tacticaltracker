import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MAPS, MapName, PLAYERS } from "@/types/match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronUp, Shield, Sword, Link as LinkIcon, FileDown, Check, Copy, Pencil, MessageSquare, User, X, List, LayoutGrid } from "lucide-react";
import GameplanExport from "@/components/GameplanExport";
import { toast } from "sonner";

const DEFAULT_PLAYER_DESCRIPTIONS: Record<string, string> = {
  Froud: "Lurker · DTT y ST",
  Fedu: "Soporte · IGL",
  Hanzo: "AWPer principal",
  Diuva: "Star Player",
  Gyer: "Ancla",
};

// Legacy localStorage keys for migration
const STORAGE_KEY = "hambrientos_playbook";
const PLAYER_DESC_KEY = "hambrientos_player_descriptions";

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

const STRAT_TYPE_ORDER = ["Pistol", "Anti-Eco", "Forzado", "Default", "Exec", "Setup", "Dominio", "Retake", "Postplant", "Finalización", "Calls de base", "Sorpresa"];
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

function dbRowToStrategy(row: any): Strategy {
  return {
    id: row.id,
    map: row.map as MapName,
    side: row.side as "CT" | "TR",
    type: row.type,
    name: row.name,
    description: row.description || "",
    playerRoles: (row.player_roles as Record<string, string>) || {},
    notes: row.notes || "",
    link: row.link || "",
    status: row.status as Strategy["status"],
  };
}

function sortByType(strats: Strategy[]): Strategy[] {
  return [...strats].sort((a, b) => {
    const ai = STRAT_TYPE_ORDER.indexOf(a.type);
    const bi = STRAT_TYPE_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export default function Playbook() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<MapName>("Nuke");
  const [selectedSide, setSelectedSide] = useState<"CT" | "TR" | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allExpanded, setAllExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStrat, setEditingStrat] = useState<Strategy | null>(null);
  const [gameplanMode, setGameplanMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gameplanMap, setGameplanMap] = useState<MapName | "all">("all");
  const [showCodewords, setShowCodewords] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [playerDescriptions, setPlayerDescriptions] = useState<Record<string, string>>({ ...DEFAULT_PLAYER_DESCRIPTIONS });
  const [editingPlayerDesc, setEditingPlayerDesc] = useState<string | null>(null);
  const [tempPlayerDesc, setTempPlayerDesc] = useState("");

  // Load strategies from Supabase on mount
  const fetchStrategies = useCallback(async () => {
    const { data, error } = await supabase.from("strategies").select("*");
    if (error) {
      console.error("Error loading strategies:", error);
      // Fallback to localStorage if DB is empty or errors
      const local = localStorage.getItem(STORAGE_KEY);
      setStrategies(local ? JSON.parse(local) : getDefaultStrategies());
    } else if (data.length === 0) {
      // Seed defaults into DB
      const defaults = getDefaultStrategies();
      const rows = defaults.map((s) => ({
        id: crypto.randomUUID(),
        map: s.map, side: s.side, type: s.type, name: s.name,
        description: s.description, player_roles: s.playerRoles as any,
        notes: s.notes, link: s.link, status: s.status,
      }));
      await supabase.from("strategies").insert(rows);
      const { data: seeded } = await supabase.from("strategies").select("*");
      setStrategies((seeded || []).map(dbRowToStrategy));
    } else {
      setStrategies(data.map(dbRowToStrategy));
    }
    setLoading(false);
  }, []);

  // Load player descriptions from Supabase
  const fetchPlayerDescriptions = useCallback(async () => {
    const { data } = await supabase.from("player_descriptions").select("*");
    if (data && data.length > 0) {
      const descs: Record<string, string> = { ...DEFAULT_PLAYER_DESCRIPTIONS };
      data.forEach((row) => { descs[row.player] = row.description; });
      setPlayerDescriptions(descs);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
    fetchPlayerDescriptions();
  }, [fetchStrategies, fetchPlayerDescriptions]);

  const ensureProtocol = (url: string) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed.match(/^https?:\/\//i)) return trimmed;
    // Remove any accidental leading slashes or colons
    const cleaned = trimmed.replace(/^[:/]+/, '');
    return `https://${cleaned}`;
  };

  const savePlayerDesc = async (player: string) => {
    setPlayerDescriptions((prev) => ({ ...prev, [player]: tempPlayerDesc }));
    setEditingPlayerDesc(null);
    await supabase.from("player_descriptions").upsert({ player, description: tempPlayerDesc });
    toast.success(`Descripción de ${player} actualizada`);
  };

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

  const deleteStrat = async (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("strategies").delete().eq("id", id);
    toast.success("Estrategia eliminada");
  };

  const duplicateStrat = async (strat: Strategy) => {
    const newId = crypto.randomUUID();
    const dup: Strategy = { ...strat, id: newId, name: `${strat.name} (copia)`, status: "Draft", playerRoles: { ...strat.playerRoles } };
    setStrategies((prev) => [dup, ...prev]);
    await supabase.from("strategies").insert({
      id: newId, map: dup.map, side: dup.side, type: dup.type, name: dup.name,
      description: dup.description, player_roles: dup.playerRoles as any,
      notes: dup.notes, link: dup.link, status: dup.status,
    });
    toast.success("Estrategia duplicada");
  };

  const startEdit = (strat: Strategy) => {
    setEditingStrat({ ...strat, playerRoles: { ...strat.playerRoles } });
    setShowForm(false);
    setExpandedId(null);
  };

  const saveEdit = async (updated: Strategy) => {
    setStrategies((prev) => prev.map((s) => s.id === updated.id ? updated : s));
    setEditingStrat(null);
    await supabase.from("strategies").update({
      map: updated.map, side: updated.side, type: updated.type, name: updated.name,
      description: updated.description, player_roles: updated.playerRoles as any,
      notes: updated.notes, link: updated.link, status: updated.status,
    }).eq("id", updated.id);
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

    const mapSections = Object.entries(byMap).map(([map, strats], mapIdx) => {
      const ctS = sortByType(strats.filter((s) => s.side === "CT"));
      const trS = sortByType(strats.filter((s) => s.side === "TR"));
      const renderStrat = (s: Strategy) => `
        <div style="page-break-inside:avoid;border:2px solid #000;border-radius:4px;padding:10px 12px;margin-bottom:10px;background:#fff;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="border:2px solid #000;font-size:11px;padding:1px 6px;border-radius:3px;font-weight:900;letter-spacing:1px;">${s.side}</span>
            <span style="border:1px solid #666;font-size:10px;padding:1px 6px;border-radius:3px;color:#333;">${s.type}</span>
            <strong style="color:#000;font-size:14px;">${s.name}</strong>
            <span style="margin-left:auto;font-size:10px;font-weight:bold;color:#000;text-transform:uppercase;border:1px solid #000;padding:1px 5px;border-radius:3px;">${s.status}</span>
          </div>
          <p style="color:#222;font-size:12px;margin:0 0 8px;line-height:1.5;">${s.description}</p>
          ${selectedPlayer && s.playerRoles[selectedPlayer] ? `<div style="border:2px solid #000;border-radius:4px;padding:6px 10px;margin-bottom:6px;background:#f0f0f0;"><strong style="font-size:12px;">${selectedPlayer}</strong><span style="font-size:12px;margin-left:8px;">${s.playerRoles[selectedPlayer]}</span><span style="font-size:10px;margin-left:8px;color:#555;">${playerDescriptions[selectedPlayer] || ''}</span></div>` : (Object.keys(s.playerRoles).length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${Object.entries(s.playerRoles).map(([p, r]) => `<span style="font-size:11px;background:#f0f0f0;padding:3px 8px;border-radius:4px;border:1px solid #999;"><strong>${p}</strong>: ${r}</span>`).join('')}</div>` : '')}
          ${s.notes ? `<p style="font-size:11px;color:#333;border-left:3px solid #000;padding-left:8px;margin:6px 0;line-height:1.4;">${s.notes}</p>` : ''}
        </div>`;

      // CT section with page break before TR to avoid mixing
      const ctBlock = ctS.length > 0 ? `<h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">🛡️ CT SIDE — ${map}</h3>${ctS.map(renderStrat).join('')}` : '';
      const trBlock = trS.length > 0 ? `<div style="page-break-before:${ctS.length > 0 ? 'always' : 'auto'};"><h3 style="font-size:16px;margin:14px 0 8px;border-bottom:1px solid #000;padding-bottom:4px;">⚔️ TR SIDE — ${map}</h3>${trS.map(renderStrat).join('')}</div>` : '';

      return `
        <div style="page-break-before:${mapIdx === 0 ? 'auto' : 'always'};">
          <h2 style="font-size:22px;margin:0 0 10px;border-bottom:3px solid #000;padding-bottom:6px;letter-spacing:1px;">📋 ${map.toUpperCase()}</h2>
          ${ctBlock}
          ${trBlock}
        </div>`;
    }).join('');

    const html = `<html><head><style>
      @page{size:A4;margin:15mm 18mm;}
      *{box-sizing:border-box;}
      body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000;margin:0;padding:16px;font-size:12px;line-height:1.4;}
      @media print{body{background:#fff;}}
    </style></head><body>
      <div style="text-align:center;margin-bottom:20px;border-bottom:3px solid #000;padding-bottom:12px;">
        <h1 style="font-size:30px;margin:0;letter-spacing:3px;">HAMBRIENTOS</h1>
        <p style="font-size:12px;margin:4px 0;color:#333;">GAMEPLAN${selectedPlayer ? ` · ${selectedPlayer} (${playerDescriptions[selectedPlayer] || ''})` : ''} · ${new Date().toLocaleDateString('es-AR')} · ${selectedIds.size} estrategias</p>
      </div>
      ${mapSections}
      <div style="text-align:center;margin-top:20px;font-size:9px;color:#666;border-top:1px solid #ccc;padding-top:8px;">HAMBRIENTOS CS2 Team · Generado automáticamente</div>
    </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); setTimeout(() => printWindow.print(), 500); }
    toast.success("Gameplan listo para imprimir");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-accent animate-pulse" />
          <p className="text-muted-foreground text-sm">Cargando playbook...</p>
        </div>
      </div>
    );
  }

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
            const isEditing = editingPlayerDesc === p;
            const playerStratCount = strategies.filter((s) => s.playerRoles[p]).length;
            return (
              <div key={p} className="flex flex-col">
                <button
                  onClick={() => setSelectedPlayer(isActive ? null : p)}
                  className={cn(
                    "flex flex-col items-start px-3 py-2 rounded-lg border transition-all text-left",
                    isActive ? "border-accent bg-accent/10 text-accent" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-foreground/20"
                  )}
                >
                  <span className="text-xs font-heading font-bold">{p}</span>
                  {isEditing ? (
                    <div className="flex gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                      <Input value={tempPlayerDesc} onChange={(e) => setTempPlayerDesc(e.target.value)} className="h-6 text-[10px] w-36" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); savePlayerDesc(p); } }} autoFocus />
                      <button type="button" onClick={(e) => { e.stopPropagation(); savePlayerDesc(p); }} className="text-success"><Check className="h-3 w-3" /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingPlayerDesc(null); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <span className="text-[10px] opacity-70 group flex items-center gap-1">
                      {playerDescriptions[p]}
                      <button onClick={(e) => { e.stopPropagation(); setEditingPlayerDesc(p); setTempPlayerDesc(playerDescriptions[p] || ""); }} className="opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  <span className="text-[9px] mt-0.5 opacity-50">{playerStratCount} strats</span>
                </button>
              </div>
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
        <div className="flex gap-1 ml-auto items-center">
          <div className="flex gap-1 mr-3 bg-secondary/50 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("board")} className={cn("p-1.5 rounded-md transition-all", viewMode === "board" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          {(["all", "CT", "TR"] as const).map((s) => (
            <button key={s} onClick={() => setSelectedSide(s)} className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-all", selectedSide === s ? s === "CT" ? "bg-primary text-primary-foreground" : s === "TR" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground" : "bg-secondary/50 text-muted-foreground")}>
              {s === "all" ? "Todos" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Gameplan mode + Expand all */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={gameplanMode ? "default" : "outline"} size="sm" onClick={() => { setGameplanMode(!gameplanMode); if (gameplanMode) setSelectedIds(new Set()); }} className={gameplanMode ? "gradient-accent text-accent-foreground" : ""}>
          <FileDown className="h-4 w-4 mr-1" />{gameplanMode ? `Gameplan (${selectedIds.size})` : "Armar Gameplan"}
        </Button>
        <Button variant={allExpanded ? "default" : "outline"} size="sm" onClick={() => setAllExpanded(!allExpanded)}>
          {allExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {allExpanded ? "Colapsar todas" : "Expandir todas"}
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
      {!editingStrat && viewMode === "list" && (
        <>
          {(selectedSide === "all" || selectedSide === "CT") && ctStrats.length > 0 && (
            <StratSection title="CT Side" icon={<Shield className="h-5 w-5" />} strats={ctStrats} expandedId={expandedId} setExpandedId={setExpandedId} allExpanded={allExpanded} onDelete={deleteStrat} onDuplicate={duplicateStrat} onEdit={startEdit} gameplanMode={gameplanMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} selectedPlayer={selectedPlayer} ensureProtocol={ensureProtocol} playerDescriptions={playerDescriptions} />
          )}
          {(selectedSide === "all" || selectedSide === "TR") && trStrats.length > 0 && (
            <StratSection title="TR Side" icon={<Sword className="h-5 w-5" />} strats={trStrats} expandedId={expandedId} setExpandedId={setExpandedId} allExpanded={allExpanded} onDelete={deleteStrat} onDuplicate={duplicateStrat} onEdit={startEdit} gameplanMode={gameplanMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} selectedPlayer={selectedPlayer} ensureProtocol={ensureProtocol} playerDescriptions={playerDescriptions} />
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
              onSubmit={async (s) => { const newId = crypto.randomUUID(); const newStrat = { ...s, id: newId }; setStrategies((prev) => [newStrat, ...prev]); setShowForm(false); await supabase.from("strategies").insert({ id: newId, map: s.map, side: s.side, type: s.type, name: s.name, description: s.description, player_roles: s.playerRoles as any, notes: s.notes, link: s.link, status: s.status }); toast.success("Estrategia agregada"); }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <Button onClick={() => setShowForm(true)} className="gradient-accent text-accent-foreground w-full">
              <Plus className="h-4 w-4 mr-2" /> Agregar Estrategia
            </Button>
          )}
        </>
      )}

      {!editingStrat && viewMode === "board" && (
        <BoardView
          strategies={strategies}
          selectedSide={selectedSide}
          selectedPlayer={selectedPlayer}
          onEdit={startEdit}
          onDelete={deleteStrat}
          onDuplicate={duplicateStrat}
          ensureProtocol={ensureProtocol}
          playerDescriptions={playerDescriptions}
        />
      )}
    </div>
  );
}

function BoardView({ strategies, selectedSide, selectedPlayer, onEdit, onDelete, onDuplicate, ensureProtocol, playerDescriptions }: {
  strategies: Strategy[];
  selectedSide: "CT" | "TR" | "all";
  selectedPlayer: string | null;
  onEdit: (s: Strategy) => void;
  onDelete: (id: string) => void;
  onDuplicate: (s: Strategy) => void;
  ensureProtocol: (url: string) => string;
  playerDescriptions: Record<string, string>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredByPlayer = selectedPlayer
    ? strategies.filter((s) => s.playerRoles[selectedPlayer])
    : strategies;

  const filteredBySide = selectedSide === "all"
    ? filteredByPlayer
    : filteredByPlayer.filter((s) => s.side === selectedSide);

  const statusColors: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Ready: "bg-success/20 text-success",
    Probado: "bg-primary/20 text-primary-foreground",
  };

  if (filteredBySide.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p className="font-heading">Sin estrategias para mostrar</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4" style={{ minWidth: `${MAPS.length * 300}px` }}>
        {MAPS.map((map) => {
          const mapStrats = filteredBySide.filter((s) => s.map === map);
          // Group by type
          const byType: Record<string, Strategy[]> = {};
          STRAT_TYPE_ORDER.forEach((t) => {
            const typed = mapStrats.filter((s) => s.type === t);
            if (typed.length > 0) byType[t] = typed;
          });
          // Also catch any types not in order
          mapStrats.forEach((s) => {
            if (!STRAT_TYPE_ORDER.includes(s.type)) {
              if (!byType[s.type]) byType[s.type] = [];
              if (!byType[s.type].includes(s)) byType[s.type].push(s);
            }
          });

          return (
            <div key={map} className="flex-shrink-0 w-[300px] bg-secondary/30 rounded-xl border border-border">
              <div className="p-3 border-b border-border sticky top-0 bg-secondary/30 rounded-t-xl">
                <h3 className="font-heading font-bold text-sm text-foreground">{map}</h3>
                <span className="text-[10px] text-muted-foreground">{mapStrats.length} strats</span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {mapStrats.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Sin strats</p>
                )}
                {Object.entries(byType).map(([type, strats]) => (
                  <div key={type} className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-secondary/60 px-2.5 py-1.5 border-b border-border">
                      <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-foreground/70">{type}</span>
                      <span className="text-[9px] text-muted-foreground ml-1.5">({strats.length})</span>
                    </div>
                    <div className="divide-y divide-border">
                      {strats.map((s) => {
                        const isExpanded = expandedId === s.id;
                        return (
                          <div key={s.id} className="bg-card hover:bg-secondary/20 transition-colors">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : s.id)}
                              className="w-full text-left px-2.5 py-2 flex items-center gap-2"
                            >
                              <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", s.side === "CT" ? "bg-primary" : "bg-accent")} />
                              <span className="text-[10px] font-semibold text-muted-foreground shrink-0">{s.side}</span>
                              <span className="text-xs font-heading font-semibold truncate flex-1">{s.name}</span>
                              <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-semibold shrink-0", statusColors[s.status])}>{s.status}</span>
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                            </button>
                            {isExpanded && (
                              <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50 pt-2" onClick={(e) => e.stopPropagation()}>
                                <p className="text-[11px] text-foreground/80 leading-relaxed">{s.description}</p>
                                {Object.keys(s.playerRoles).length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(s.playerRoles).map(([p, r]) => (
                                      <span key={p} className={cn("text-[9px] bg-secondary rounded px-1.5 py-0.5", selectedPlayer === p && "ring-1 ring-accent bg-accent/10")}>
                                        <strong className="text-accent">{p}</strong>: {r}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {s.notes && <p className="text-[10px] text-muted-foreground border-l-2 border-accent/50 pl-2">{s.notes}</p>}
                                {s.link && (
                                  <a href={ensureProtocol(s.link)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-1 hover:underline">
                                    <LinkIcon className="h-2.5 w-2.5" /> Ver referencia
                                  </a>
                                )}
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => onEdit(s)} className="text-[10px] text-muted-foreground hover:text-accent flex items-center gap-0.5"><Pencil className="h-2.5 w-2.5" /> Editar</button>
                                  <button onClick={() => onDuplicate(s)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" /> Duplicar</button>
                                  <button onClick={() => onDelete(s.id)} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"><Trash2 className="h-2.5 w-2.5" /> Eliminar</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StratSection({ title, icon, strats, expandedId, setExpandedId, allExpanded, onDelete, onDuplicate, onEdit, gameplanMode, selectedIds, onToggleSelect, selectedPlayer, ensureProtocol, playerDescriptions }: {
  title: string; icon: React.ReactNode; strats: Strategy[]; expandedId: string | null; setExpandedId: (id: string | null) => void;
  allExpanded: boolean;
  onDelete: (id: string) => void; onDuplicate: (s: Strategy) => void; onEdit: (s: Strategy) => void;
  gameplanMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void;
  selectedPlayer: string | null; ensureProtocol: (url: string) => string; playerDescriptions: Record<string, string>;
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
            const isExpanded = allExpanded || expandedId === s.id;
            const isSelected = selectedIds.has(s.id);
            const statusColors: Record<string, string> = { Draft: "bg-muted text-muted-foreground", Ready: "bg-success/20 text-success", Probado: "bg-primary/20 text-primary-foreground" };
            return (
              <div key={s.id} className={cn("bg-card rounded-lg border card-glow overflow-hidden transition-all", isSelected ? "border-accent/50 bg-accent/5" : "border-border")}>
                <div className="flex items-center gap-2 p-4">
                  {gameplanMode && <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(s.id)} className="shrink-0" />}
                  <button onClick={() => setExpandedId(isExpanded ? null : s.id)} className="flex items-center gap-3 flex-1 text-left hover:bg-secondary/30 transition-colors rounded">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold uppercase", statusColors[s.status])}>{s.status}</span>
                    <span className="font-heading font-semibold text-sm flex-1">{s.name}</span>
                    {selectedPlayer && s.playerRoles[selectedPlayer] && (
                      <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded">{selectedPlayer}: {s.playerRoles[selectedPlayer]}</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <p className="text-sm text-foreground/90">{s.description}</p>
                    {selectedPlayer ? (
                      s.playerRoles[selectedPlayer] && (
                        <div className="bg-accent/10 border border-accent/20 rounded-md p-3">
                          <span className="text-xs font-heading font-bold text-accent">{selectedPlayer}</span>
                          <p className="text-sm text-foreground mt-1">{s.playerRoles[selectedPlayer]}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{playerDescriptions[selectedPlayer]}</p>
                        </div>
                      )
                    ) : (
                      Object.keys(s.playerRoles).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(s.playerRoles).map(([player, role]) => (
                            <span key={player} className="text-xs bg-secondary rounded-md px-2 py-1"><strong className="text-accent">{player}</strong>: {role}</span>
                          ))}
                        </div>
                      )
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground border-l-2 border-accent/50 pl-2">{s.notes}</p>}
                    {s.link && (
                      <a href={ensureProtocol(s.link)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
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
