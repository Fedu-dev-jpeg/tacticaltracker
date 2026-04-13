import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AgendaEvent {
  id: string;
  date: string;
  time_start: string;
  time_end: string;
  title: string;
  description: string;
  event_type: string;
  created_by: string;
}

const EVENT_TYPES: Record<string, { label: string; color: string }> = {
  training: { label: "Entrenamiento", color: "bg-accent/20 border-accent/40 text-accent" },
  scrim: { label: "Scrim", color: "bg-blue-500/20 border-blue-500/40 text-blue-400" },
  match: { label: "Partido Oficial", color: "bg-red-500/20 border-red-500/40 text-red-400" },
  review: { label: "Review / Demo", color: "bg-purple-500/20 border-purple-500/40 text-purple-400" },
  meeting: { label: "Reunión", color: "bg-green-500/20 border-green-500/40 text-green-400" },
  off: { label: "Día Libre", color: "bg-muted/40 border-muted text-muted-foreground" },
};

export default function Agenda() {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [form, setForm] = useState({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
  const [loading, setLoading] = useState(true);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("agenda_events").select("*").order("date").order("time_start");
    if (error) { toast.error("Error al cargar agenda"); console.error(error); }
    else setEvents(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!selectedDate || !form.title.trim()) { toast.error("Completá título y fecha"); return; }
    const { error } = await supabase.from("agenda_events").insert({
      date: format(selectedDate, "yyyy-MM-dd"),
      title: form.title.trim(),
      description: form.description.trim(),
      time_start: form.time_start,
      time_end: form.time_end,
      event_type: form.event_type,
    });
    if (error) { toast.error("Error al guardar"); console.error(error); return; }
    toast.success("Evento agregado");
    setDialogOpen(false);
    setForm({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("agenda_events").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Evento eliminado");
    fetchEvents();
  };

  const openNewEvent = (date: Date) => {
    setSelectedDate(date);
    setForm({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
    setDialogOpen(true);
  };

  const getEventsForDay = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date));

  const isToday = (date: Date) => isSameDay(date, new Date());

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-slide-up">
      {/* Week header */}
      <div className="bg-card rounded-lg border border-border p-4 card-glow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-accent" />
            <div>
              <h2 className="text-lg font-heading font-bold">Agenda del Equipo</h2>
              <p className="text-xs text-muted-foreground">
                {format(currentWeekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Hoy
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {daysOfWeek.map((day) => {
          const dayEvents = getEventsForDay(day);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-card rounded-lg border p-3 min-h-[140px] flex flex-col card-glow transition-all",
                today ? "border-accent/50 ring-1 ring-accent/20" : "border-border"
              )}
            >
              {/* Day header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-xs font-heading font-bold uppercase",
                    today ? "text-accent" : "text-muted-foreground"
                  )}>
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span className={cn(
                    "text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center",
                    today ? "bg-accent text-accent-foreground" : "text-foreground"
                  )}>
                    {format(day, "d")}
                  </span>
                </div>
                <button
                  onClick={() => openNewEvent(day)}
                  className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Events */}
              <div className="flex-1 space-y-1.5">
                {dayEvents.map((ev) => {
                  const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.training;
                  return (
                    <div
                      key={ev.id}
                      className={cn("rounded-md border p-1.5 text-[10px] group relative", typeInfo.color)}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        <span>{ev.time_start}–{ev.time_end}</span>
                      </div>
                      <p className="font-semibold text-[11px] leading-tight">{ev.title}</p>
                      {ev.description && (
                        <p className="opacity-70 leading-tight mt-0.5">{ev.description}</p>
                      )}
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/30 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {dayEvents.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/50 italic">Sin eventos</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
          <div key={key} className={cn("rounded-md border px-2 py-1 text-[10px] font-medium", color)}>
            {label}
          </div>
        ))}
      </div>

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Nuevo Evento · {selectedDate && format(selectedDate, "EEE d MMM", { locale: es })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Título</label>
              <Input
                placeholder="Ej: Treino Nuke CT"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Inicio</label>
                <Input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Fin</label>
                <Input type="time" value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descripción (opcional)</label>
              <Textarea
                placeholder="Detalles, foco del día, notas..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <Button onClick={handleAdd} className="w-full gradient-accent text-white font-heading">
              Agregar Evento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
