import { useState, useEffect } from "react";
import { MAPS, MapName, PLAYERS } from "@/types/match";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronUp, Shield, Sword, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export interface Strategy {
  id: string;
  map: MapName;
  side: "CT" | "TR";
  type: string; // Pistol, Forzado, Anti-Eco, Default, Exec, etc.
  name: string;
  description: string;
  playerRoles: Record<string, string>; // player -> role
  notes: string;
  link: string;
  status: "Draft" | "Ready" | "Probado";
}

const STRAT_TYPES = ["Pistol", "Forzado", "Anti-Eco", "Default", "Exec", "Retake", "Postplant", "Dominio", "Sorpresa", "Calls de base"];

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
    {
      id: "def-1", map: "Nuke", side: "TR", type: "Default", name: "Lobby Split",
      description: "Default con control de lobby. Hanzo lobby, Froud AWP outside, Diuva door/silo, Gyer rotador, Fedu soporte.",
      playerRoles: { Hanzo: "Lobby", Froud: "AWP", Diuva: "Outside", Gyer: "Door/Silo", Fedu: "Rotador" },
      notes: "Ganar info de ramp antes de commitear", link: "", status: "Ready"
    },
    {
      id: "def-2", map: "Nuke", side: "CT", type: "Default", name: "Ramp Control",
      description: "Setup CT con foco en mantener ramp. Diuva ramp, Hanzo A anchor, Froud door/main, Fedu outside, Froud AWP.",
      playerRoles: { Diuva: "Ramp", Hanzo: "A Anchor", Froud: "AWP", Fedu: "Outside", Gyer: "Door/Main" },
      notes: "Rotación rápida si pierden ramp", link: "", status: "Ready"
    },
    {
      id: "def-3", map: "Inferno", side: "TR", type: "Default", name: "Banana Aggro",
      description: "Control agresivo de banana con Hanzo aggro y Fedu soporte. AWP Froud desde T spawn.",
      playerRoles: { Hanzo: "Banana Aggro", Fedu: "Banana Supp", Froud: "AWP", Gyer: "Boiler", Diuva: "Apps" },
      notes: "Molly car, smoke CT, progresar con flashes", link: "", status: "Ready"
    },
    {
      id: "def-4", map: "Ancient", side: "TR", type: "Exec", name: "B Split Mid",
      description: "Split B desde mid. Diuva outside B, Gyer mid aggro, Froud AWP, Hanzo outside A como lurk.",
      playerRoles: { Diuva: "Outside B", Gyer: "Mid Aggro", Froud: "AWP", Hanzo: "Outside A", Fedu: "Roamer" },
      notes: "Timing importante con smokes de mid", link: "", status: "Draft"
    },
    {
      id: "def-5", map: "Anubis", side: "CT", type: "Retake", name: "B Retake 3-man",
      description: "Retake B con 3 jugadores desde mid y connector. Utility coordinada.",
      playerRoles: { Froud: "AWP Mid", Hanzo: "Entry", Diuva: "Soporte", Fedu: "Anchor A", Gyer: "Info Canal" },
      notes: "No retakear sin al menos 2 flashes", link: "", status: "Draft"
    },
  ];
}

export default function Playbook() {
  const [strategies, setStrategies] = useState<Strategy[]>(loadStrategies);
  const [selectedMap, setSelectedMap] = useState<MapName>("Nuke");
  const [selectedSide, setSelectedSide] = useState<"CT" | "TR" | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  }, [strategies]);

  const filtered = strategies.filter((s) => {
    if (s.map !== selectedMap) return false;
    if (selectedSide !== "all" && s.side !== selectedSide) return false;
    return true;
  });

  const ctStrats = filtered.filter((s) => s.side === "CT");
  const trStrats = filtered.filter((s) => s.side === "TR");

  const deleteStrat = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    toast.success("Estrategia eliminada");
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Map + Side selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {MAPS.map((map) => {
            const count = strategies.filter((s) => s.map === map).length;
            return (
              <button
                key={map}
                onClick={() => setSelectedMap(map)}
                className={cn(
                  "px-4 py-2 rounded-lg font-heading font-bold text-sm transition-all border",
                  selectedMap === map
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {map}
                <span className="block text-xs font-body font-normal">{count} strats</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["all", "CT", "TR"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSide(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                selectedSide === s
                  ? s === "CT" ? "bg-primary text-primary-foreground" : s === "TR" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                  : "bg-secondary/50 text-muted-foreground"
              )}
            >
              {s === "all" ? "Todos" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Strategies grouped by side */}
      {(selectedSide === "all" || selectedSide === "CT") && ctStrats.length > 0 && (
        <StratSection title="CT Side" icon={<Shield className="h-5 w-5" />} strats={ctStrats} expandedId={expandedId} setExpandedId={setExpandedId} onDelete={deleteStrat} />
      )}
      {(selectedSide === "all" || selectedSide === "TR") && trStrats.length > 0 && (
        <StratSection title="TR Side" icon={<Sword className="h-5 w-5" />} strats={trStrats} expandedId={expandedId} setExpandedId={setExpandedId} onDelete={deleteStrat} />
      )}

      {filtered.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="font-heading">Sin estrategias en {selectedMap}</p>
          <p className="text-sm">Agregá la primera estrategia para este mapa</p>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <AddStrategyForm
          defaultMap={selectedMap}
          onAdd={(s) => { setStrategies((prev) => [s, ...prev]); setShowForm(false); toast.success("Estrategia agregada"); }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button onClick={() => setShowForm(true)} className="gradient-accent text-accent-foreground w-full">
          <Plus className="h-4 w-4 mr-2" /> Agregar Estrategia
        </Button>
      )}
    </div>
  );
}

function StratSection({ title, icon, strats, expandedId, setExpandedId, onDelete }: {
  title: string; icon: React.ReactNode; strats: Strategy[]; expandedId: string | null; setExpandedId: (id: string | null) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-heading font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
        {icon} {title}
      </h3>
      {strats.map((s) => {
        const isExpanded = expandedId === s.id;
        const statusColors = { Draft: "bg-muted text-muted-foreground", Ready: "bg-success/20 text-success", Probado: "bg-primary/20 text-primary-foreground" };
        return (
          <div key={s.id} className="bg-card rounded-lg border border-border card-glow overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
            >
              <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold uppercase", statusColors[s.status])}>{s.status}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">{s.type}</span>
              <span className="font-heading font-semibold text-sm flex-1">{s.name}</span>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <p className="text-sm text-foreground/90">{s.description}</p>
                {Object.keys(s.playerRoles).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(s.playerRoles).map(([player, role]) => (
                      <span key={player} className="text-xs bg-secondary rounded-md px-2 py-1">
                        <strong className="text-accent">{player}</strong>: {role}
                      </span>
                    ))}
                  </div>
                )}
                {s.notes && <p className="text-xs text-muted-foreground border-l-2 border-accent/50 pl-2">{s.notes}</p>}
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <LinkIcon className="h-3 w-3" /> Ver referencia
                  </a>
                )}
                <button onClick={() => onDelete(s.id)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
                  <Trash2 className="h-3 w-3" /> Eliminar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddStrategyForm({ defaultMap, onAdd, onCancel }: { defaultMap: MapName; onAdd: (s: Strategy) => void; onCancel: () => void }) {
  const [map, setMap] = useState<MapName>(defaultMap);
  const [side, setSide] = useState<"CT" | "TR">("TR");
  const [type, setType] = useState(STRAT_TYPES[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<Strategy["status"]>("Draft");
  const [playerRoles, setPlayerRoles] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { toast.error("Nombre requerido"); return; }
    onAdd({
      id: crypto.randomUUID(),
      map, side, type, name, description,
      playerRoles: Object.fromEntries(Object.entries(playerRoles).filter(([, v]) => v)),
      notes, link, status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-accent/30 p-6 space-y-4 card-glow">
      <h3 className="font-heading font-bold text-lg flex items-center gap-2">
        <Plus className="h-5 w-5 text-accent" /> Nueva Estrategia
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
        <Button type="submit" className="gradient-accent text-accent-foreground flex-1">Guardar</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
