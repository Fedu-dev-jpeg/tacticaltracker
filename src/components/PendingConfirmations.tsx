import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePendingMatches, PendingMatch, PendingPlayerStat } from "@/hooks/usePendingMatches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Trash2, Users, Map, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP_OPTIONS = [
  "Mirage",
  "Inferno",
  "Nuke",
  "Anubis",
  "Ancient",
  "Dust2",
  "Vertigo",
  "Overpass",
  "Train",
];

const ROLE_OPTIONS = [
  "IGL",
  "AWPer",
  "Entry / Star",
  "Lurker",
  "Support",
  "Ancla A",
  "Ancla B",
  "Rotador",
];

const TYPE_OPTIONS = [
  { value: "OFFICIAL", label: "Torneo / Oficial" },
  { value: "TRAINING", label: "Entrenamiento" },
  { value: "Treino", label: "Treino" },
  { value: "Oficial", label: "Oficial" },
];

interface Draft {
  map: string;
  type: string;
  rival: string;
  score_us: number;
  score_them: number;
  starting_side: "CT" | "TR";
  players: Record<string, { role: string; kills: number; deaths: number; assists: number }>;
}

function buildDraft(m: PendingMatch): Draft {
  const players: Draft["players"] = {};
  for (const s of m.stats) {
    players[s.id] = {
      role: s.role ?? "",
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
    };
  }
  return {
    map: m.map ?? "Mirage",
    type: m.type ?? "OFFICIAL",
    rival: m.rival && m.rival !== "Sin definir" ? m.rival : "",
    score_us: m.score_us ?? 0,
    score_them: m.score_them ?? 0,
    starting_side: (m.starting_side === "TR" ? "TR" : "CT"),
    players,
  };
}

export default function PendingConfirmations() {
  const { pending, loading, refetch } = usePendingMatches();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [discardId, setDiscardId] = useState<string | null>(null);

  const getDraft = (m: PendingMatch): Draft => drafts[m.id] ?? buildDraft(m);
  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? buildDraft(pending.find((m) => m.id === id)!)), ...patch } }));
  const patchPlayer = (matchId: string, statId: string, patch: Partial<Draft["players"][string]>) =>
    setDrafts((d) => {
      const base = d[matchId] ?? buildDraft(pending.find((m) => m.id === matchId)!);
      return {
        ...d,
        [matchId]: {
          ...base,
          players: {
            ...base.players,
            [statId]: { ...base.players[statId], ...patch },
          },
        },
      };
    });

  const confirmMatch = async (m: PendingMatch) => {
    const draft = getDraft(m);
    if (!draft.rival.trim()) {
      toast.error("Ingresá el nombre del equipo rival");
      return;
    }
    setSavingId(m.id);
    // 1. Update match
    const { error: mErr } = await supabase
      .from("matches")
      .update({
        map: draft.map,
        type: draft.type,
        rival: draft.rival.trim(),
        score_us: draft.score_us,
        score_them: draft.score_them,
        starting_side: draft.starting_side,
        confirmed: true,
      })
      .eq("id", m.id);
    if (mErr) {
      setSavingId(null);
      toast.error("No se pudo guardar la partida: " + mErr.message);
      return;
    }
    // 2. Update each player_stats row
    for (const [statId, p] of Object.entries(draft.players)) {
      await supabase
        .from("player_stats")
        .update({ role: p.role || null, kills: p.kills, deaths: p.deaths, assists: p.assists })
        .eq("id", statId);
    }
    setSavingId(null);
    setExpandedId(null);
    setDrafts((d) => {
      const next = { ...d };
      delete next[m.id];
      return next;
    });
    toast.success(`Partida confirmada: ${draft.rival} · ${draft.map}`);
    refetch();
  };

  const discardMatch = async (id: string) => {
    await supabase.from("player_stats").delete().eq("match_id", id);
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo descartar: " + error.message);
      return;
    }
    toast.info("Demo descartada");
    setDiscardId(null);
    setExpandedId(null);
    refetch();
  };

  const totalPending = pending.length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando pendientes…
        </CardContent>
      </Card>
    );
  }

  if (totalPending === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
          No hay demos pendientes de confirmación.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Estas partidas fueron importadas desde una demo y todavía no se reflejan en dashboard/historial.
        Revisá y corregí mapa, marcador, rival y roles antes de confirmar.
      </div>

      {pending.map((m) => {
        const draft = getDraft(m);
        const isExpanded = expandedId === m.id;
        const rivalTags =
          (m.demo_data as { team_them?: { players?: { tag: string }[] } } | null)?.team_them?.players?.map((p) => p.tag) ?? [];

        return (
          <Card key={m.id} className="border-accent/30">
            <CardHeader
              className="cursor-pointer select-none py-3"
              onClick={() => setExpandedId(isExpanded ? null : m.id)}
            >
              <CardTitle className="text-sm flex items-center gap-2 font-normal">
                <Badge variant="outline" className="border-accent/50 text-accent uppercase text-[10px]">
                  Pendiente
                </Badge>
                <span className="font-mono text-xs text-muted-foreground truncate max-w-[220px]">
                  {(m.notes ?? "").replace(/^Importado desde demo:\s*/, "") || m.id}
                </span>
                <span className="ml-2 inline-flex items-center gap-1 text-xs">
                  <Map className="h-3 w-3 text-accent" /> {m.map ?? "?"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs">
                  <Trophy className="h-3 w-3 text-accent" /> {m.score_us ?? "?"}-{m.score_them ?? "?"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs">
                  <Users className="h-3 w-3 text-accent" /> {m.stats.length}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </CardTitle>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-4">
                {/* Basic fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mapa</Label>
                    <Select value={draft.map} onValueChange={(v) => patchDraft(m.id, { map: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MAP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={draft.type} onValueChange={(v) => patchDraft(m.id, { type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Empezamos</Label>
                    <div className="flex gap-1">
                      {(["CT", "TR"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => patchDraft(m.id, { starting_side: s })}
                          className={cn(
                            "flex-1 py-2 rounded-md text-xs font-semibold transition-all",
                            draft.starting_side === s
                              ? s === "CT"
                                ? "bg-primary text-primary-foreground"
                                : "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label className="text-xs">Rival</Label>
                    <Input
                      value={draft.rival}
                      onChange={(e) => patchDraft(m.id, { rival: e.target.value })}
                      placeholder="Nombre del equipo rival"
                      maxLength={100}
                    />
                    {rivalTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] text-muted-foreground mr-1">Tags detectados:</span>
                        {rivalTags.map((t, i) => (
                          <Badge key={i} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Score nosotros</Label>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      value={draft.score_us}
                      onChange={(e) => patchDraft(m.id, { score_us: parseInt(e.target.value || "0", 10) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Score rival</Label>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      value={draft.score_them}
                      onChange={(e) => patchDraft(m.id, { score_them: parseInt(e.target.value || "0", 10) })}
                    />
                  </div>
                </div>

                {/* Players */}
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Roles y estadísticas por jugador ({m.stats.length})
                  </div>
                  <div className="divide-y divide-border">
                    {m.stats.length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground">Sin jugadores vinculados a esta partida.</div>
                    )}
                    {m.stats.map((s: PendingPlayerStat) => {
                      const p = draft.players[s.id];
                      return (
                        <div key={s.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs">
                          <div className="col-span-3 truncate">
                            <div className="font-medium">{s.steam_tag ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{s.steam_id ?? ""}</div>
                          </div>
                          <div className="col-span-3">
                            <Select
                              value={p?.role ?? ""}
                              onValueChange={(v) => patchPlayer(m.id, s.id, { role: v })}
                            >
                              <SelectTrigger className="h-8"><SelectValue placeholder="Rol / posición" /></SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              className="h-8"
                              value={p?.kills ?? 0}
                              onChange={(e) => patchPlayer(m.id, s.id, { kills: parseInt(e.target.value || "0", 10) })}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              className="h-8"
                              value={p?.deaths ?? 0}
                              onChange={(e) => patchPlayer(m.id, s.id, { deaths: parseInt(e.target.value || "0", 10) })}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              className="h-8"
                              value={p?.assists ?? 0}
                              onChange={(e) => patchPlayer(m.id, s.id, { assists: parseInt(e.target.value || "0", 10) })}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wide bg-muted/10">
                      <div className="col-span-3">Jugador</div>
                      <div className="col-span-3">Rol</div>
                      <div className="col-span-2">K</div>
                      <div className="col-span-2">D</div>
                      <div className="col-span-2">A</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDiscardId(m.id)}
                    disabled={savingId === m.id}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Descartar demo
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => confirmMatch(m)}
                    disabled={savingId === m.id}
                    className="gradient-accent text-accent-foreground"
                  >
                    {savingId === m.id ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Guardando…</>
                    ) : (
                      <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar partida</>
                    )}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <AlertDialog open={!!discardId} onOpenChange={(o) => !o && setDiscardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar la demo pendiente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la partida y todas las estadísticas asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => discardId && discardMatch(discardId)}
            >
              Sí, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
