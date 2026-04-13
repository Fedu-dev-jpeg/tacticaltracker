import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval,
  isSameDay, parseISO, startOfMonth, endOfMonth, addMonths, subMonths,
  addDays, subDays, eachDayOfInterval as eachDay, getDay, isSameMonth
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Clock, Edit2 } from "lucide-react";
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

type ViewMode = "day" | "week" | "month";

export default function Agenda() {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
  const [form, setForm] = useState({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("agenda_events").select("*").order("date").order("time_start");
    if (error) { toast.error("Error al cargar agenda"); console.error(error); }
    else setEvents(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!selectedDate || !form.title.trim()) { toast.error("Completá título y fecha"); return; }
    if (editingEvent) {
      const { error } = await supabase.from("agenda_events").update({
        date: format(selectedDate, "yyyy-MM-dd"),
        title: form.title.trim(),
        description: form.description.trim(),
        time_start: form.time_start,
        time_end: form.time_end,
        event_type: form.event_type,
      }).eq("id", editingEvent.id);
      if (error) { toast.error("Error al actualizar"); return; }
      toast.success("Evento actualizado");
    } else {
      const { error } = await supabase.from("agenda_events").insert({
        date: format(selectedDate, "yyyy-MM-dd"),
        title: form.title.trim(),
        description: form.description.trim(),
        time_start: form.time_start,
        time_end: form.time_end,
        event_type: form.event_type,
      });
      if (error) { toast.error("Error al guardar"); return; }
      toast.success("Evento agregado");
    }
    closeDialog();
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
    setEditingEvent(null);
    setForm({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
    setDialogOpen(true);
  };

  const openEditEvent = (ev: AgendaEvent) => {
    setSelectedDate(parseISO(ev.date));
    setEditingEvent(ev);
    setForm({ title: ev.title, description: ev.description, time_start: ev.time_start, time_end: ev.time_end, event_type: ev.event_type });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
  };

  const getEventsForDay = (date: Date) =>
    events.filter((e) => isSameDay(parseISO(e.date), date));

  const navigate = (dir: -1 | 1) => {
    if (viewMode === "day") setCurrentDate(dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const goToday = () => setCurrentDate(new Date());

  const getTitle = () => {
    if (viewMode === "day") return format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, "d MMM", { locale: es })} – ${format(we, "d MMM yyyy", { locale: es })}`;
    }
    return format(currentDate, "MMMM yyyy", { locale: es });
  };

  // ── Event card ──
  const EventCard = ({ ev, compact = false }: { ev: AgendaEvent; compact?: boolean }) => {
    const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.training;
    return (
      <div className={cn("rounded-md border p-1.5 group relative", typeInfo.color, compact ? "text-[10px]" : "text-xs")}>
        <div className="flex items-center gap-1 mb-0.5">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span>{ev.time_start}–{ev.time_end}</span>
        </div>
        <p className={cn("font-semibold leading-tight", compact ? "text-[11px]" : "text-sm")}>{ev.title}</p>
        {!compact && ev.description && <p className="opacity-70 leading-tight mt-0.5">{ev.description}</p>}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
          <button onClick={() => openEditEvent(ev)} className="p-0.5 rounded hover:bg-accent/30"><Edit2 className="h-3 w-3" /></button>
          <button onClick={() => handleDelete(ev.id)} className="p-0.5 rounded hover:bg-destructive/30"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    );
  };

  // ── Day view ──
  const DayView = () => {
    const dayEvents = getEventsForDay(currentDate);
    const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 - 23:00
    return (
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-heading font-bold text-sm capitalize">{format(currentDate, "EEEE d", { locale: es })}</h3>
          <button onClick={() => openNewEvent(currentDate)} className="p-1.5 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
          {hours.map((h) => {
            const hourStr = String(h).padStart(2, "0");
            const hourEvents = dayEvents.filter((e) => e.time_start.startsWith(hourStr));
            return (
              <div key={h} className="flex min-h-[48px]">
                <div className="w-16 shrink-0 text-right pr-3 py-2 text-xs text-muted-foreground">
                  {hourStr}:00
                </div>
                <div className="flex-1 py-1 px-2 space-y-1 border-l border-border">
                  {hourEvents.map((ev) => <EventCard key={ev.id} ev={ev} />)}
                </div>
              </div>
            );
          })}
        </div>
        {dayEvents.length === 0 && (
          <p className="text-center text-muted-foreground/50 text-sm py-8 italic">Sin eventos para hoy</p>
        )}
      </div>
    );
  };

  // ── Week view ──
  const WeekView = () => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const we = endOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: ws, end: we });

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const today = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-card rounded-lg border p-3 min-h-[140px] flex flex-col card-glow transition-all",
                today ? "border-accent/50 ring-1 ring-accent/20" : "border-border"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-xs font-heading font-bold uppercase", today ? "text-accent" : "text-muted-foreground")}>
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span className={cn("text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center", today ? "bg-accent text-accent-foreground" : "text-foreground")}>
                    {format(day, "d")}
                  </span>
                </div>
                <button onClick={() => openNewEvent(day)} className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 space-y-1.5">
                {dayEvents.map((ev) => <EventCard key={ev.id} ev={ev} compact />)}
                {dayEvents.length === 0 && <p className="text-[10px] text-muted-foreground/50 italic">Sin eventos</p>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Month view ──
  const MonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

    return (
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="text-center text-xs font-heading font-bold text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {allDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const today = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[90px] border-b border-r border-border p-1.5 transition-colors cursor-pointer hover:bg-accent/5",
                  !inMonth && "opacity-40"
                )}
                onClick={() => {
                  setCurrentDate(day);
                  setViewMode("day");
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    "text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center",
                    today ? "bg-accent text-accent-foreground" : "text-foreground"
                  )}>
                    {format(day, "d")}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openNewEvent(day); }}
                    className="p-0.5 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent transition-colors opacity-0 hover:opacity-100"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map((ev) => {
                    const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.training;
                    return (
                      <div key={ev.id} className={cn("rounded px-1 py-0.5 text-[9px] font-medium truncate border", typeInfo.color)}>
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <p className="text-[9px] text-muted-foreground font-medium pl-1">+{dayEvents.length - 2} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-slide-up">
      {/* Header */}
      <div className="bg-card rounded-lg border border-border p-4 card-glow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-accent" />
            <div>
              <h2 className="text-lg font-heading font-bold">Agenda del Equipo</h2>
              <p className="text-xs text-muted-foreground capitalize">{getTitle()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["day", "week", "month"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-heading font-bold transition-colors",
                    viewMode === mode
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  {mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>Hoy</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* View content */}
      {viewMode === "day" && <DayView />}
      {viewMode === "week" && <WeekView />}
      {viewMode === "month" && <MonthView />}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
          <div key={key} className={cn("rounded-md border px-2 py-1 text-[10px] font-medium", color)}>{label}</div>
        ))}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingEvent ? "Editar Evento" : "Nuevo Evento"} · {selectedDate && format(selectedDate, "EEE d MMM", { locale: es })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Título</label>
              <Input placeholder="Ej: Treino Nuke CT" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
              <Textarea placeholder="Detalles, foco del día, notas..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleSave} className="w-full gradient-accent text-white font-heading">
              {editingEvent ? "Guardar Cambios" : "Agregar Evento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
