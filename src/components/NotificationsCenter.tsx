import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarCheck, CheckCheck, ClipboardList, Trophy, UserCheck, X } from "lucide-react";
import { format, parseISO, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAgendaEvents } from "@/hooks/useAgendaEvents";
import { useTournaments } from "@/hooks/useTournaments";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAuth } from "@/contexts/AuthContext";
import type { Match } from "@/types/match";
import { useEffect, useState } from "react";

type AttendanceRecordLite = {
  attendance_date: string;
};

type NotifKind = "tournament" | "training" | "attendance";

type ToolNotification = {
  id: string;
  kind: NotifKind;
  title: string;
  description: string;
  date: string;
  route: string;
  icon: typeof Trophy;
  severity: "warning" | "danger" | "info";
};

const KIND_META: Record<NotifKind | "all", { label: string; icon: typeof Trophy }> = {
  all: { label: "Todas", icon: Bell },
  tournament: { label: "Torneos", icon: Trophy },
  training: { label: "Demos", icon: ClipboardList },
  attendance: { label: "Presencialidad", icon: UserCheck },
};

function toDateKey(value: string | Date) {
  const date = typeof value === "string" ? parseISO(value) : value;
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function isBeforeToday(dateKey: string) {
  return dateKey < toDateKey(startOfToday());
}

function isTrainingEvent(eventType: string, title: string, description: string) {
  const text = `${eventType} ${title} ${description}`.toLowerCase();
  return eventType === "training" || /\b(treino|entreno|training|pracc|practice)\b/i.test(text);
}

export default function NotificationsCenter({ matches }: { matches: Match[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isCoach } = useUserRole();
  const { data: agendaEvents = [] } = useAgendaEvents();
  const { tournaments } = useTournaments();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecordLite[]>([]);
  const canManageStaffTools = isAdmin || isCoach;
  const dismissKey = user ? `notif:dismissed:${user.id}` : "notif:dismissed:anon";
  const [dismissed, setDismissed] = useLocalStorage<string[]>(dismissKey, []);
  const [filter, setFilter] = useState<NotifKind | "all">("all");

  useEffect(() => {
    if (!canManageStaffTools) {
      setAttendanceRecords([]);
      return;
    }

    let cancelled = false;
    supabase
      .from("attendance_records")
      .select("attendance_date")
      .then(({ data, error }) => {
        if (cancelled) return;
        setAttendanceRecords(error ? [] : ((data as AttendanceRecordLite[]) ?? []));
      });

    return () => {
      cancelled = true;
    };
  }, [canManageStaffTools]);

  const allNotifications = useMemo(() => {
    const matchDates = new Set(matches.map((match) => toDateKey(match.date)));
    const treinoDates = new Set(
      matches.filter((match) => match.type === "Treino").map((match) => toDateKey(match.date)),
    );
    const attendanceDates = new Set(attendanceRecords.map((record) => record.attendance_date));
    const items: ToolNotification[] = [];

    for (const tournament of tournaments) {
      const tournamentDate = toDateKey(tournament.start_date);
      if (
        isBeforeToday(tournamentDate) &&
        tournament.status !== "completed" &&
        tournament.status !== "cancelled" &&
        !matchDates.has(tournamentDate)
      ) {
        items.push({
          id: `tournament-${tournament.id}`,
          kind: "tournament",
          title: "Resultado de torneo pendiente",
          description: `${tournament.name} ya pasó y no hay partida registrada ese día.`,
          date: tournamentDate,
          route: `/registrar?date=${tournamentDate}&type=Oficial`,
          icon: Trophy,
          severity: "danger",
        });
      }
    }

    const trainingEvents = agendaEvents.filter((event) =>
      isTrainingEvent(event.event_type, event.title, event.description),
    );

    for (const event of trainingEvents) {
      if (isBeforeToday(event.date) && !treinoDates.has(event.date)) {
        items.push({
          id: `training-${event.id}`,
          kind: "training",
          title: "Treino sin registro en historial",
          description: `${event.title} estaba agendado y falta cargar el treino.`,
          date: event.date,
          route: `/registrar?date=${event.date}&type=Treino`,
          icon: ClipboardList,
          severity: "warning",
        });
      }

      if (canManageStaffTools && isBeforeToday(event.date) && !attendanceDates.has(event.date)) {
        items.push({
          id: `attendance-${event.id}`,
          kind: "attendance",
          title: "Presencialidad pendiente",
          description: `Falta tomar presencialidad para el treino ${event.title}.`,
          date: event.date,
          route: `/awards?date=${event.date}`,
          icon: UserCheck,
          severity: "info",
        });
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [agendaEvents, attendanceRecords, canManageStaffTools, matches, tournaments]);

  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const activeNotifications = useMemo(
    () => allNotifications.filter((item) => !dismissedSet.has(item.id)),
    [allNotifications, dismissedSet],
  );

  const visibleNotifications = useMemo(
    () =>
      (filter === "all"
        ? activeNotifications
        : activeNotifications.filter((item) => item.kind === filter)
      ).slice(0, 20),
    [activeNotifications, filter],
  );

  const urgentCount = activeNotifications.filter((item) => item.severity !== "info").length;

  const dismissOne = (id: string) => {
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const acceptAll = () => {
    const ids = (filter === "all" ? activeNotifications : visibleNotifications).map((n) => n.id);
    setDismissed((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const countByKind = (kind: NotifKind) =>
    activeNotifications.filter((item) => item.kind === kind).length;

  const filters: (NotifKind | "all")[] = ["all", "tournament", "training", "attendance"];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 rounded-md border border-border/60 bg-card/50 px-0 hover:bg-accent/10"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
          {activeNotifications.length > 0 && (
            <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-accent-foreground">
              {activeNotifications.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-heading font-bold">Notificaciones</div>
            <div className="text-xs text-muted-foreground">Recordatorios operativos del equipo</div>
          </div>
          <Badge variant="outline" className="border-accent/30 text-accent">
            {urgentCount} urgentes
          </Badge>
        </div>
        <Separator />
        <div className="flex flex-wrap gap-1 p-2">
          {filters.map((k) => {
            const meta = KIND_META[k];
            const count = k === "all" ? activeNotifications.length : countByKind(k);
            const Icon = meta.icon;
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition ${
                  active
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-border bg-card text-muted-foreground hover:border-accent/30"
                }`}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
                <span className="ml-1 rounded bg-background/60 px-1 text-[9px]">{count}</span>
              </button>
            );
          })}
        </div>
        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {visibleNotifications.length} visibles
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[10px] text-accent hover:text-accent"
              onClick={acceptAll}
              disabled={visibleNotifications.length === 0}
            >
              <CheckCheck className="h-3 w-3" />
              Aceptar todas
            </Button>
          </div>
        </div>
        <Separator />
        <div className="max-h-[420px] overflow-y-auto p-2">
          {visibleNotifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <CalendarCheck className="mx-auto mb-2 h-8 w-8 text-accent" />
              Todo al día.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotifications.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="group relative w-full rounded-md border border-border bg-card p-3 text-left transition hover:border-accent/40 hover:bg-accent/5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissOne(item.id);
                      }}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                      aria-label="Descartar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(item.route)}
                      className="flex w-full gap-3 pr-6 text-left"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent/10">
                        <Icon className="h-4 w-4 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{item.title}</div>
                          <Badge
                            variant="outline"
                            className={
                              item.severity === "danger"
                                ? "border-destructive/30 text-destructive"
                                : item.severity === "warning"
                                  ? "border-yellow-500/30 text-yellow-300"
                                  : "border-accent/30 text-accent"
                            }
                          >
                            {format(parseISO(item.date), "d MMM", { locale: es })}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
