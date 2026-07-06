import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Tournament, useTournaments } from "@/hooks/useTournaments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trophy, Plus, Pencil, Trash2, CalendarClock, Info, ClipboardList, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const FORMATS = ["BO1", "BO3", "BO5"] as const;
const STATUSES = [
  { value: "upcoming", label: "Próximo" },
  { value: "in_progress", label: "En curso" },
  { value: "completed", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

function statusLabel(s: string) {
  return STATUSES.find((x) => x.value === s)?.label ?? s;
}

function statusColor(s: string) {
  switch (s) {
    case "upcoming": return "bg-accent/20 text-accent border-accent/30";
    case "in_progress": return "bg-success/20 text-success border-success/30";
    case "completed": return "bg-muted text-muted-foreground border-border";
    case "cancelled": return "bg-destructive/20 text-destructive border-destructive/40";
    default: return "";
  }
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

interface FormState {
  name: string;
  start_date: string; // datetime-local
  format: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  start_date: "",
  format: "BO3",
  status: "upcoming",
  notes: "",
};

export default function TournamentsManager() {
  const { isAdmin } = useUserRole();
  const { tournaments, loading, refetch } = useTournaments();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (t: Tournament) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      start_date: toLocalInputValue(t.start_date),
      format: t.format,
      status: t.status,
      notes: t.notes ?? "",
    });
    setOpen(true);
  };

  const toAgendaDateParts = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStart = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const end = new Date(d.getTime() + 2 * 60 * 60 * 1000);
    const timeEnd = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    return { date, timeStart, timeEnd };
  };

  const tournamentMarker = (id: string) => `[TOURNAMENT_ID:${id}]`;

  const upsertTournamentAgendaEvent = async (tournament: Tournament) => {
    const marker = tournamentMarker(tournament.id);
    const { date, timeStart, timeEnd } = toAgendaDateParts(tournament.start_date);
    const descriptionLines = [
      marker,
      `Formato: ${tournament.format}`,
      `Estado: ${statusLabel(tournament.status)}`,
      tournament.notes?.trim() || "",
    ].filter(Boolean);
    const payload = {
      title: `🏆 Torneo · ${tournament.name}`,
      description: descriptionLines.join("\n"),
      date,
      time_start: timeStart,
      time_end: timeEnd,
      event_type: "tournament",
      created_by: "tournament-sync",
    };

    const { data: existing } = await supabase
      .from("agenda_events")
      .select("*")
      .like("description", `%${marker}%`)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from("agenda_events")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error("No se pudo actualizar agenda: " + error.message);
      return data;
    }

    const { data, error } = await supabase
      .from("agenda_events")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error("No se pudo crear evento de agenda: " + error.message);
    return data;
  };

  const pushAgendaEventToTeamup = async (agendaEvent: {
    id: string;
    title: string;
    description: string;
    date: string;
    time_start: string;
    time_end: string;
    teamup_event_id?: string | null;
  }) => {
    const { data, error } = await supabase.functions.invoke("teamup-sync", {
      body: {
        action: "push",
        event: {
          id: agendaEvent.id,
          title: agendaEvent.title,
          description: agendaEvent.description,
          date: agendaEvent.date,
          time_start: agendaEvent.time_start,
          time_end: agendaEvent.time_end,
          teamup_event_id: agendaEvent.teamup_event_id ?? null,
        },
      },
    });
    if (error) throw new Error(error.message);
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    const teamupId = (data as { teamup_event_id?: string })?.teamup_event_id;
    if (teamupId && teamupId !== agendaEvent.teamup_event_id) {
      await supabase.from("agenda_events").update({ teamup_event_id: teamupId }).eq("id", agendaEvent.id);
    }
    return teamupId ?? null;
  };

  const syncTournamentToTeamup = async (tournament: Tournament) => {
    setSyncingId(tournament.id);
    try {
      const agendaEvent = await upsertTournamentAgendaEvent(tournament);
      const teamupId = await pushAgendaEventToTeamup(agendaEvent);
      toast.success("Torneo sincronizado con Teamup", {
        description: teamupId ? `ID Teamup: ${teamupId}` : "Evento enviado",
      });
    } catch (e) {
      toast.error("No se pudo sincronizar torneo", { description: String((e as Error).message) });
    } finally {
      setSyncingId(null);
    }
  };

  const submit = async (syncAfterSave = false) => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio");
    if (!form.start_date) return toast.error("La fecha es obligatoria");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      start_date: new Date(form.start_date).toISOString(),
      format: form.format,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    const { data, error } = editingId
      ? await supabase.from("tournaments").update(payload).eq("id", editingId).select("*").single()
      : await supabase.from("tournaments").insert(payload).select("*").single();
    setSaving(false);
    if (error) return toast.error("No se pudo guardar: " + error.message);
    const savedTournament = data as Tournament;
    toast.success(editingId ? "Torneo actualizado" : "Torneo creado");
    if (syncAfterSave) {
      await syncTournamentToTeamup(savedTournament);
    }
    setOpen(false);
    refetch();
  };

  const remove = async (t: Tournament) => {
    if (!confirm(`¿Eliminar torneo "${t.name}"?`)) return;
    const { error } = await supabase.from("tournaments").delete().eq("id", t.id);
    if (error) return toast.error("No se pudo eliminar: " + error.message);
    toast.success("Torneo eliminado");
    refetch();
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 card-glow space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg gradient-accent">
            <Trophy className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-bold">Torneos</h3>
            <p className="text-xs text-muted-foreground">Agendá torneos y detalles de la preparación</p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew} className="gradient-accent">
                <Plus className="h-4 w-4 mr-1" /> Nuevo torneo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar torneo" : "Nuevo torneo"}</DialogTitle>
                <DialogDescription>
                  Definí fecha, formato y detalles de la preparación
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Copa Hambrientos 2026"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Fecha y hora</Label>
                    <Input
                      type="datetime-local"
                      value={form.start_date}
                      onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Formato</Label>
                    <Select value={form.format} onValueChange={(v) => setForm((f) => ({ ...f, format: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORMATS.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" /> Detalles de la preparación
                  </Label>
                  <Textarea
                    rows={5}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={`Ej:\n- Foco: pistols y anti-eco\n- Mapas: Nuke / Ancient / Inferno\n- Scrims: L-M-J 19hs\n- Rivales potenciales: ...`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  variant="outline"
                  onClick={() => submit(true)}
                  disabled={saving}
                  className="border-accent/40 text-accent hover:bg-accent/10"
                >
                  {saving ? "Guardando…" : "Guardar + Sync Teamup"}
                </Button>
                <Button onClick={() => submit(false)} disabled={saving} className="gradient-accent">
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear torneo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando torneos…</p>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-md">
          <Info className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Todavía no hay torneos agendados.</p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">
              Tocá "Nuevo torneo" para agregar el próximo.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tournaments.map((t) => {
            const date = new Date(t.start_date);
            const dateLabel = date.toLocaleString("es-AR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            });
            return (
              <div key={t.id} className="rounded-md border border-border bg-secondary/20 p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold">{t.name}</span>
                      <Badge variant="outline" className="text-[10px]">{t.format}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${statusColor(t.status)}`}>
                        {statusLabel(t.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> {dateLabel}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 border-accent/40 text-accent hover:bg-accent/10"
                        onClick={() => syncTournamentToTeamup(t)}
                        disabled={syncingId === t.id}
                        title="Sincronizar torneo en Teamup"
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingId === t.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(t)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => remove(t)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {t.notes && (
                  <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap border-t border-border/50 pt-2">
                    {t.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
