import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarCheck,
  Clock,
  Download,
  RefreshCw,
  Save,
  ShieldAlert,
  TimerOff,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamMembers, TeamMember } from "@/hooks/useTeamMembers";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SteamAvatar from "@/components/SteamAvatar";
import { cn } from "@/lib/utils";

type AttendanceRecord = {
  id: string;
  team_member_id: string;
  attendance_date: string;
  arrival_time: string | null;
  late_level: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DraftRecord = {
  arrival_time: string;
  late_level: number;
  notes: string;
};

const TRAINING_START_MINUTES = 18 * 60;
const VERY_LATE_MINUTES = 18 * 60 + 30;
const CANCELLATION_MINUTES = 19 * 60;
const CANCELLATION_LOST_MINUTES = 120;

const LEVELS: Record<number, { label: string; short: string; className: string }> = {
  0: {
    label: "En horario",
    short: "OK",
    className: "bg-success/15 text-success border-success/30",
  },
  1: {
    label: "Llegada tarde",
    short: "Tarde",
    className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  },
  2: {
    label: "Muy tarde",
    short: "Muy tarde",
    className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  3: {
    label: "Caso de cancelación",
    short: "Cancelación",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const monthStartLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const parseDateKey = (dateKey: string) => parseISO(`${dateKey}T00:00:00`);

const dateToKey = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const timeToMinutes = (time: string | null | undefined) => {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const classifyArrival = (time: string) => {
  const minutes = timeToMinutes(time);
  if (minutes === null || minutes <= TRAINING_START_MINUTES) return 0;
  if (minutes <= VERY_LATE_MINUTES) return 1;
  if (minutes <= CANCELLATION_MINUTES) return 2;
  return 3;
};

const lostMinutesFor = (record: Pick<AttendanceRecord, "arrival_time" | "late_level">) => {
  if (record.late_level === 3) return CANCELLATION_LOST_MINUTES;
  const arrival = timeToMinutes(record.arrival_time);
  if (arrival === null || arrival <= TRAINING_START_MINUTES) return 0;
  return arrival - TRAINING_START_MINUTES;
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
};

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export default function Awards() {
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get("date");
  const { isAdmin, isCoach, loading: roleLoading } = useUserRole();
  const { members, loading: membersLoading } = useTeamMembers();
  const [selectedDate, setSelectedDate] = useState(requestedDate ?? todayLocal());
  const [fromDate, setFromDate] = useState(monthStartLocal());
  const [toDate, setToDate] = useState(todayLocal());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});

  const canManageAttendance = isAdmin || isCoach;
  const players = useMemo(
    () => members.filter((member) => !member.is_coach),
    [members],
  );

  const fetchRecords = async () => {
    if (!canManageAttendance) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate)
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("No se pudo cargar presencialidad");
      setRecords([]);
    } else {
      setRecords((data as AttendanceRecord[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (requestedDate) {
      setSelectedDate(requestedDate);
      if (requestedDate < fromDate) setFromDate(requestedDate);
      if (requestedDate > toDate) setToDate(requestedDate);
    }
  }, [fromDate, requestedDate, toDate]);

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAttendance, fromDate, toDate]);

  useEffect(() => {
    const selectedRecords = records.filter((record) => record.attendance_date === selectedDate);
    const nextDrafts: Record<string, DraftRecord> = {};
    for (const player of players) {
      const record = selectedRecords.find((item) => item.team_member_id === player.id);
      nextDrafts[player.id] = {
        arrival_time: record?.arrival_time?.slice(0, 5) ?? "",
        late_level: record?.late_level ?? 0,
        notes: record?.notes ?? "",
      };
    }
    setDrafts(nextDrafts);
  }, [players, records, selectedDate]);

  if (roleLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;
  if (!canManageAttendance) return <Navigate to="/" replace />;

  const selectedDayRecords = records.filter((record) => record.attendance_date === selectedDate);
  const selectedDayRecordByMember = new Map(selectedDayRecords.map((record) => [record.team_member_id, record]));
  const selectedDateObj = parseDateKey(selectedDate);
  const selectedWeekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(selectedDateObj, { weekStartsOn: 1 }), index),
  ).filter((day) => day.getDay() !== 6);
  const isSaturdaySelected = selectedDateObj.getDay() === 6;

  const savePlayer = async (player: TeamMember) => {
    const draft = drafts[player.id] ?? { arrival_time: "", late_level: 0, notes: "" };
    if (draft.late_level !== 3 && !draft.arrival_time) {
      toast.error(`Cargá el horario de llegada de ${player.player_name}`);
      return;
    }

    setSavingId(player.id);
    const { error } = await supabase.from("attendance_records").upsert(
      {
        team_member_id: player.id,
        attendance_date: selectedDate,
        arrival_time: draft.late_level === 3 && !draft.arrival_time ? null : draft.arrival_time,
        late_level: draft.late_level,
        notes: draft.notes.trim() || null,
      },
      { onConflict: "team_member_id,attendance_date" },
    );
    setSavingId(null);

    if (error) {
      toast.error("No se pudo guardar el registro");
      return;
    }

    toast.success(`${player.player_name} registrado`);
    fetchRecords();
  };

  const setDraft = (memberId: string, patch: Partial<DraftRecord>) => {
    setDrafts((current) => ({
      ...current,
      [memberId]: {
        arrival_time: "",
        late_level: 0,
        notes: "",
        ...current[memberId],
        ...patch,
      },
    }));
  };

  const markNow = (memberId: string) => {
    const now = new Date();
    const arrival = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setDraft(memberId, { arrival_time: arrival, late_level: classifyArrival(arrival) });
  };

  const overviewRows = players.map((player) => {
    const playerRecords = records.filter((record) => record.team_member_id === player.id);
    const late = playerRecords.filter((record) => record.late_level === 1).length;
    const veryLate = playerRecords.filter((record) => record.late_level === 2).length;
    const cancellations = playerRecords.filter((record) => record.late_level === 3).length;
    const lostMinutes = playerRecords.reduce((sum, record) => sum + lostMinutesFor(record), 0);
    return {
      player,
      total: playerRecords.length,
      onTime: playerRecords.filter((record) => record.late_level === 0).length,
      late,
      veryLate,
      cancellations,
      lostMinutes,
    };
  });

  const totalRecords = records.length;
  const lateRecords = records.filter((record) => record.late_level > 0 && record.late_level < 3).length;
  const cancellationRecords = records.filter((record) => record.late_level === 3).length;
  const totalLostMinutes = records.reduce((sum, record) => sum + lostMinutesFor(record), 0);

  const exportExcelCsv = () => {
    if (records.length === 0) {
      toast.error("No hay registros para exportar");
      return;
    }
    const playerById = new Map(players.map((player) => [player.id, player]));
    const rows = [
      ["Jugador", "Fecha", "Llegada", "Estado", "Nivel", "Minutos perdidos", "Notas"],
      ...records.map((record) => {
        const player = playerById.get(record.team_member_id);
        return [
          player?.player_name ?? "Jugador eliminado",
          record.attendance_date,
          record.arrival_time?.slice(0, 5) ?? "-",
          LEVELS[record.late_level]?.label ?? "Sin estado",
          record.late_level,
          lostMinutesFor(record),
          record.notes ?? "",
        ];
      }),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `presencialidad_${fromDate}_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
            <UserCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-heading">Presencialidad</h1>
            <p className="text-sm text-muted-foreground">
              Registro privado para coaches y administración: llegadas, tardanzas y tiempo perdido de treino.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchRecords} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Card className="border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card card-glow">
        <CardContent className="p-4 flex gap-3 items-start">
          <ShieldAlert className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Regla automática:</strong> el horario base es{" "}
            <span className="text-accent font-mono">18:00</span>. Después de esa hora se marca como llegada tarde;
            desde <span className="text-accent font-mono">18:31</span> como muy tarde y después de{" "}
            <span className="text-accent font-mono">19:00</span> como caso de cancelación. El nivel se puede ajustar
            manualmente antes de guardar.
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="registro" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="registro">Registro</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="registro" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-accent" />
                  Toma de asistencia
                </CardTitle>
                <div className="flex items-end gap-2">
                  <div>
                    <Label className="text-xs">Día de treino</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[230px] justify-start text-left font-normal">
                          <CalendarCheck className="mr-2 h-4 w-4 text-accent" />
                          {format(selectedDateObj, "EEEE d MMM", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDateObj}
                          onSelect={(date) => {
                            if (!date) return;
                            const next = dateToKey(date);
                            setSelectedDate(next);
                            if (next < fromDate) setFromDate(next);
                            if (next > toDate) setToDate(next);
                          }}
                          weekStartsOn={1}
                          locale={es}
                          initialFocus
                        />
                        <div className="border-t border-border p-3">
                          <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                            Semana seleccionada
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {selectedWeekDays.map((day) => {
                              const dayKey = dateToKey(day);
                              const active = dayKey === selectedDate;
                              return (
                                <button
                                  key={dayKey}
                                  onClick={() => {
                                    setSelectedDate(dayKey);
                                    if (dayKey < fromDate) setFromDate(dayKey);
                                    if (dayKey > toDate) setToDate(dayKey);
                                  }}
                                  className={cn(
                                    "rounded-md border px-1.5 py-2 text-center transition",
                                    active
                                      ? "border-accent bg-accent text-accent-foreground"
                                      : "border-border bg-card hover:border-accent/40",
                                  )}
                                >
                                  <div className="text-[9px] uppercase text-current/70">
                                    {format(day, "EEE", { locale: es })}
                                  </div>
                                  <div className="text-sm font-bold">{format(day, "d")}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jugador</TableHead>
                      <TableHead className="w-[150px]">Llegada</TableHead>
                      <TableHead className="w-[210px]">Nivel</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="w-[180px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          Cargando roster...
                        </TableCell>
                      </TableRow>
                    ) : players.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No hay jugadores cargados en el roster.
                        </TableCell>
                      </TableRow>
                    ) : (
                      players.map((player) => {
                        const draft = drafts[player.id] ?? { arrival_time: "", late_level: 0, notes: "" };
                        const saved = selectedDayRecordByMember.get(player.id);
                        return (
                          <TableRow key={player.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <SteamAvatar
                                  memberId={player.id}
                                  url={player.steam_avatar_url}
                                  fallback={player.player_name}
                                  size={34}
                                  className="text-xs"
                                />
                                <div>
                                  <div className="font-medium">{player.player_name}</div>
                                  <div className="text-xs text-muted-foreground">{player.role_in_team ?? "Sin rol"}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="time"
                                value={draft.arrival_time}
                                onChange={(event) => {
                                  const arrival = event.target.value;
                                  setDraft(player.id, {
                                    arrival_time: arrival,
                                    late_level: arrival ? classifyArrival(arrival) : draft.late_level,
                                  });
                                }}
                                className="font-mono"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={String(draft.late_level)}
                                onValueChange={(value) => setDraft(player.id, { late_level: Number(value) })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(LEVELS).map(([level, config]) => (
                                    <SelectItem key={level} value={level}>
                                      {level}. {config.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={draft.notes}
                                placeholder="Motivo, aviso previo, observaciones..."
                                onChange={(event) => setDraft(player.id, { notes: event.target.value })}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => markNow(player.id)}>
                                  <Clock className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDraft(player.id, { arrival_time: "", late_level: 3 })}
                                >
                                  <TimerOff className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" onClick={() => savePlayer(player)} disabled={savingId === player.id}>
                                  <Save className="h-3.5 w-3.5 mr-1.5" />
                                  {saved ? "Actualizar" : "Guardar"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
            </div>
            <Button onClick={exportExcelCsv} disabled={records.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Registros" value={totalRecords} detail="asistencias cargadas" />
            <MetricCard label="Llegadas tarde" value={lateRecords} detail="nivel 1 y 2" />
            <MetricCard label="Días perdidos" value={cancellationRecords} detail="casos de cancelación" />
            <MetricCard label="Tiempo perdido" value={formatMinutes(totalLostMinutes)} detail="estimado desde las 18:00" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview por jugador</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jugador</TableHead>
                    <TableHead className="text-center">Registros</TableHead>
                    <TableHead className="text-center">En horario</TableHead>
                    <TableHead className="text-center">Tarde</TableHead>
                    <TableHead className="text-center">Muy tarde</TableHead>
                    <TableHead className="text-center">Días perdidos</TableHead>
                    <TableHead className="text-right">Tiempo perdido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Cargando presencialidad...
                      </TableCell>
                    </TableRow>
                  ) : overviewRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Sin jugadores para mostrar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    overviewRows.map((row) => (
                      <TableRow key={row.player.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <SteamAvatar
                              memberId={row.player.id}
                              url={row.player.steam_avatar_url}
                              fallback={row.player.player_name}
                              size={30}
                              className="text-xs"
                            />
                            <span className="font-medium">{row.player.player_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">{row.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={LEVELS[0].className}>
                            {row.onTime}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={LEVELS[1].className}>
                            {row.late}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={LEVELS[2].className}>
                            {row.veryLate}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={LEVELS[3].className}>
                            {row.cancellations}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatMinutes(row.lostMinutes)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registros del rango</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Jugador</TableHead>
                    <TableHead>Llegada</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Tiempo perdido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Sin registros en el rango seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => {
                      const player = players.find((item) => item.id === record.team_member_id);
                      const level = LEVELS[record.late_level] ?? LEVELS[0];
                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-xs">{record.attendance_date}</TableCell>
                          <TableCell>{player?.player_name ?? "Jugador eliminado"}</TableCell>
                          <TableCell className="font-mono">{record.arrival_time?.slice(0, 5) ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={level.className}>
                              {level.short}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{record.notes ?? "-"}</TableCell>
                          <TableCell className="text-right font-mono">{formatMinutes(lostMinutesFor(record))}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card className="border-border card-glow">
      <CardContent className="p-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-heading text-accent mt-1">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{detail}</div>
      </CardContent>
    </Card>
  );
}
