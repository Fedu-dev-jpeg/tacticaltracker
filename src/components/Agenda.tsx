import { useState, useEffect, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval,
  isSameDay, parseISO, startOfMonth, endOfMonth, addMonths, subMonths,
  addDays, subDays, getDay, isSameMonth
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Clock, Edit2, Copy, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
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

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
// date-fns getDay: 0=Sun,1=Mon... we want Mon=0
const toWeekdayIndex = (d: Date) => (getDay(d) + 6) % 7;

type ViewMode = "day" | "week" | "month";
type RepeatMode = "none" | "weekdays" | "days";

export default function Agenda() {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
  const [form, setForm] = useState({ title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training" });
  const [loading, setLoading] = useState(true);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [pendingBulkConfirm, setPendingBulkConfirm] = useState(false);
  const [duplicateEvent, setDuplicateEvent] = useState<AgendaEvent | null>(null);
  const [duplicateDate, setDuplicateDate] = useState("");

  // Bulk form
  const [bulkForm, setBulkForm] = useState({
    title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training",
    repeatMode: "weekdays" as RepeatMode,
    selectedWeekdays: [0, 1, 2, 3, 4] as number[], // Mon-Fri default
    startDate: format(new Date(), "yyyy-MM-dd"),
    numWeeks: 1,
    numDays: 7,
  });

  useEffect(() => { fetchEvents(); }, []);

  useEffect(() => {
    if (pendingBulkConfirm && !bulkDialogOpen) {
      const timer = setTimeout(() => { setPendingBulkConfirm(false); setBulkConfirmOpen(true); }, 300);
      return () => clearTimeout(timer);
    }
  }, [pendingBulkConfirm, bulkDialogOpen]);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("agenda_events").select("*").order("date").order("time_start");
    if (error) { toast.error("Error al cargar agenda"); console.error(error); }
    else setEvents(data || []);
    setLoading(false);
  };

  // ── CRUD ──
  const handleSave = async () => {
    if (!selectedDate || !form.title.trim()) { toast.error("Completá título y fecha"); return; }
    const payload = {
      date: format(selectedDate, "yyyy-MM-dd"),
      title: form.title.trim(),
      description: form.description.trim(),
      time_start: form.time_start,
      time_end: form.time_end,
      event_type: form.event_type,
    };
    if (editingEvent) {
      const { error } = await supabase.from("agenda_events").update(payload).eq("id", editingEvent.id);
      if (error) { toast.error("Error al actualizar"); return; }
      toast.success("Evento actualizado");
    } else {
      const { error } = await supabase.from("agenda_events").insert(payload);
      if (error) { toast.error("Error al guardar"); return; }
      toast.success("Evento agregado");
    }
    closeDialog();
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm(null);
    const { error } = await supabase.from("agenda_events").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Evento eliminado");
    fetchEvents();
  };

  const handleDuplicate = async () => {
    if (!duplicateEvent || !duplicateDate) { toast.error("Seleccioná una fecha"); return; }
    const { error } = await supabase.from("agenda_events").insert({
      date: duplicateDate,
      title: duplicateEvent.title,
      description: duplicateEvent.description,
      time_start: duplicateEvent.time_start,
      time_end: duplicateEvent.time_end,
      event_type: duplicateEvent.event_type,
    });
    if (error) { toast.error("Error al duplicar"); return; }
    toast.success(`Evento duplicado al ${duplicateDate}`);
    setDuplicateEvent(null);
    setDuplicateDate("");
    fetchEvents();
  };

  // ── Bulk save ──
  const handleBulkSave = async () => {
    if (!bulkForm.title.trim()) { toast.error("Completá el título"); return; }
    const start = parseISO(bulkForm.startDate);
    const dates: string[] = [];

    if (bulkForm.repeatMode === "weekdays") {
      // Generate dates for selected weekdays over numWeeks
      const totalDays = bulkForm.numWeeks * 7;
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(start, i);
        const wd = toWeekdayIndex(d);
        if (bulkForm.selectedWeekdays.includes(wd)) {
          dates.push(format(d, "yyyy-MM-dd"));
        }
      }
    } else {
      // consecutive days
      for (let i = 0; i < bulkForm.numDays; i++) {
        dates.push(format(addDays(start, i), "yyyy-MM-dd"));
      }
    }

    if (dates.length === 0) { toast.error("No se generaron fechas"); return; }

    const rows = dates.map((date) => ({
      date,
      title: bulkForm.title.trim(),
      description: bulkForm.description.trim(),
      time_start: bulkForm.time_start,
      time_end: bulkForm.time_end,
      event_type: bulkForm.event_type,
    }));

    const { error } = await supabase.from("agenda_events").insert(rows);
    if (error) { toast.error("Error al crear eventos masivos"); console.error(error); return; }
    toast.success(`${dates.length} eventos creados`);
    setBulkDialogOpen(false);
    fetchEvents();
  };

  // ── Drag & Drop ──
  const handleDragStart = (e: DragEvent, eventId: string) => {
    setDraggedEventId(eventId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", eventId);
  };

  const handleDragOver = (e: DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(dateStr);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: DragEvent, targetDate: Date) => {
    e.preventDefault();
    setDropTarget(null);
    const eventId = e.dataTransfer.getData("text/plain") || draggedEventId;
    if (!eventId) return;
    setDraggedEventId(null);

    const newDateStr = format(targetDate, "yyyy-MM-dd");
    const ev = events.find((x) => x.id === eventId);
    if (!ev || ev.date === newDateStr) return;

    // Optimistic update
    setEvents((prev) => prev.map((x) => x.id === eventId ? { ...x, date: newDateStr } : x));

    const { error } = await supabase.from("agenda_events").update({ date: newDateStr }).eq("id", eventId);
    if (error) {
      toast.error("Error al mover evento");
      fetchEvents();
      return;
    }
    toast.success(`Movido a ${format(targetDate, "EEE d MMM", { locale: es })}`);
  };

  // ── Dialog helpers ──
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

  const closeDialog = () => { setDialogOpen(false); setEditingEvent(null); };

  const openBulkDialog = () => {
    setBulkForm({
      title: "", description: "", time_start: "15:00", time_end: "19:00", event_type: "training",
      repeatMode: "weekdays", selectedWeekdays: [0, 1, 2, 3, 4],
      startDate: format(new Date(), "yyyy-MM-dd"), numWeeks: 1, numDays: 7,
    });
    setBulkDialogOpen(true);
  };

  const getEventsForDay = (date: Date) => events.filter((e) => isSameDay(parseISO(e.date), date));

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

  const toggleBulkWeekday = (wd: number) => {
    setBulkForm((f) => ({
      ...f,
      selectedWeekdays: f.selectedWeekdays.includes(wd)
        ? f.selectedWeekdays.filter((x) => x !== wd)
        : [...f.selectedWeekdays, wd].sort(),
    }));
  };

  // ── Event card (draggable) ──
  const EventCard = ({ ev, compact = false }: { ev: AgendaEvent; compact?: boolean }) => {
    const typeInfo = EVENT_TYPES[ev.event_type] || EVENT_TYPES.training;
    const isDragging = draggedEventId === ev.id;
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, ev.id)}
        onDragEnd={() => setDraggedEventId(null)}
        className={cn(
          "rounded-md border p-1.5 group relative cursor-grab active:cursor-grabbing transition-all",
          typeInfo.color,
          compact ? "text-[10px]" : "text-xs",
          isDragging && "opacity-40 scale-95"
        )}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-30 group-hover:opacity-70" />
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span>{ev.time_start}–{ev.time_end}</span>
        </div>
        <p className={cn("font-semibold leading-tight", compact ? "text-[11px]" : "text-sm")}>{ev.title}</p>
        {!compact && ev.description && <p className="opacity-70 leading-tight mt-0.5">{ev.description}</p>}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); setDuplicateEvent(ev); setDuplicateDate(""); }} className="p-0.5 rounded hover:bg-accent/30" title="Duplicar"><Copy className="h-3 w-3" /></button>
          <button onClick={(e) => { e.stopPropagation(); openEditEvent(ev); }} className="p-0.5 rounded hover:bg-accent/30"><Edit2 className="h-3 w-3" /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ev.id); }} className="p-0.5 rounded hover:bg-destructive/30"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    );
  };

  // ── Drop zone wrapper ──
  const DayDropZone = ({ date, children, className }: { date: Date; children: React.ReactNode; className?: string }) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const isOver = dropTarget === dateStr;
    return (
      <div
        onDragOver={(e) => handleDragOver(e, dateStr)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, date)}
        className={cn(className, isOver && "ring-2 ring-accent/50 bg-accent/5")}
      >
        {children}
      </div>
    );
  };

  // ── Day view ──
  const DayView = () => {
    const dayEvents = getEventsForDay(currentDate);
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);
    return (
      <DayDropZone date={currentDate} className="bg-card rounded-lg border border-border overflow-hidden">
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
                <div className="w-16 shrink-0 text-right pr-3 py-2 text-xs text-muted-foreground">{hourStr}:00</div>
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
      </DayDropZone>
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
            <DayDropZone
              key={day.toISOString()}
              date={day}
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
            </DayDropZone>
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
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-heading font-bold text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {allDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const today = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentDate);
            return (
              <DayDropZone
                key={day.toISOString()}
                date={day}
                className={cn(
                  "min-h-[90px] border-b border-r border-border p-1.5 transition-colors cursor-pointer hover:bg-accent/5",
                  !inMonth && "opacity-40"
                )}
              >
                <div onClick={() => { setCurrentDate(day); setViewMode("day"); }}>
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
              </DayDropZone>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Bulk preview count ──
  const getBulkPreviewCount = () => {
    const start = parseISO(bulkForm.startDate);
    if (bulkForm.repeatMode === "weekdays") {
      let count = 0;
      const totalDays = bulkForm.numWeeks * 7;
      for (let i = 0; i < totalDays; i++) {
        const wd = toWeekdayIndex(addDays(start, i));
        if (bulkForm.selectedWeekdays.includes(wd)) count++;
      }
      return count;
    }
    return bulkForm.numDays;
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
            {/* Bulk button */}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={openBulkDialog}>
              <Copy className="h-3.5 w-3.5" />
              Masivo
            </Button>
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

      {/* Add/Edit single event dialog */}
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

      {/* Bulk event creation dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Copy className="h-5 w-5 text-accent" />
              Crear Eventos Masivos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Título</label>
              <Input placeholder="Ej: Entrenamiento" value={bulkForm.title} onChange={(e) => setBulkForm({ ...bulkForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Inicio</label>
                <Input type="time" value={bulkForm.time_start} onChange={(e) => setBulkForm({ ...bulkForm, time_start: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Fin</label>
                <Input type="time" value={bulkForm.time_end} onChange={(e) => setBulkForm({ ...bulkForm, time_end: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <Select value={bulkForm.event_type} onValueChange={(v) => setBulkForm({ ...bulkForm, event_type: v })}>
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
              <Textarea placeholder="Detalles..." value={bulkForm.description} onChange={(e) => setBulkForm({ ...bulkForm, description: e.target.value })} rows={2} />
            </div>

            {/* Repeat mode */}
            <div className="border border-border rounded-lg p-3 space-y-3">
              <label className="text-sm font-medium block">Modo de repetición</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={bulkForm.repeatMode === "weekdays" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setBulkForm({ ...bulkForm, repeatMode: "weekdays" })}
                >
                  Por días de la semana
                </Button>
                <Button
                  type="button"
                  variant={bulkForm.repeatMode === "days" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setBulkForm({ ...bulkForm, repeatMode: "days" })}
                >
                  Días consecutivos
                </Button>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Fecha de inicio</label>
                <Input type="date" value={bulkForm.startDate} onChange={(e) => setBulkForm({ ...bulkForm, startDate: e.target.value })} />
              </div>

              {bulkForm.repeatMode === "weekdays" && (
                <>
                  <div>
                    <label className="text-xs font-medium mb-2 block text-muted-foreground">Días de la semana</label>
                    <div className="flex gap-1.5">
                      {WEEKDAY_LABELS.map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleBulkWeekday(i)}
                          className={cn(
                            "w-9 h-9 rounded-lg text-xs font-bold transition-colors border",
                            bulkForm.selectedWeekdays.includes(i)
                              ? "bg-accent text-accent-foreground border-accent"
                              : "bg-muted/20 text-muted-foreground border-border hover:border-accent/50"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Cantidad de semanas</label>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={bulkForm.numWeeks}
                      onChange={(e) => setBulkForm({ ...bulkForm, numWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                  </div>
                </>
              )}

              {bulkForm.repeatMode === "days" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Cantidad de días</label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={bulkForm.numDays}
                    onChange={(e) => setBulkForm({ ...bulkForm, numDays: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                </div>
              )}

              <div className="bg-muted/20 rounded-md p-2 text-xs text-muted-foreground">
                Se crearán <span className="font-bold text-accent">{getBulkPreviewCount()}</span> eventos
              </div>
            </div>

            <Button onClick={() => { setBulkDialogOpen(false); }} className="w-full gradient-accent text-white font-heading" data-bulk-confirm>
              Crear {getBulkPreviewCount()} Eventos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk creation confirmation */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={(v) => { if (!v) setBulkConfirmOpen(false); }}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">¿Crear {getBulkPreviewCount()} eventos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se crearán {getBulkPreviewCount()} eventos de "{bulkForm.title}" en la agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setBulkConfirmOpen(false); setBulkDialogOpen(false); handleBulkSave(); }} className="gradient-accent text-white">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate event dialog */}
      <Dialog open={!!duplicateEvent} onOpenChange={(v) => { if (!v) { setDuplicateEvent(null); setDuplicateDate(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Copy className="h-5 w-5 text-accent" />
              Duplicar Evento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Duplicar "<span className="font-semibold text-foreground">{duplicateEvent?.title}</span>" a otra fecha:
            </p>
            <Input type="date" value={duplicateDate} onChange={(e) => setDuplicateDate(e.target.value)} />
            <Button onClick={handleDuplicate} className="w-full gradient-accent text-white font-heading" disabled={!duplicateDate}>
              Duplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
