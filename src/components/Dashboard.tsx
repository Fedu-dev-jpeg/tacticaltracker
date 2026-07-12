import { useState, useEffect, useMemo, type ComponentType } from "react";
import { Match, MAPS, MATCH_TYPES, MapName, MatchType, TOURNAMENT_DATE } from "@/types/match";
import { isWin, getWinRate, getStreak, getPistolRate, getConversionRate } from "@/hooks/useMatches";
import { differenceInDays, startOfWeek, format } from "date-fns";
import { Trophy, Target, TrendingUp, Timer, Flame, User, Plus, Check, Trash2, BarChart3, Filter } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid, Legend, ReferenceLine, LabelList } from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MatchStatsDialog, { DemoData } from "@/components/MatchStatsDialog";
import TournamentCountdown from "@/components/TournamentCountdown";
import TournamentsManager from "@/components/TournamentsManager";
import { useTournaments, getUpcomingTournament } from "@/hooks/useTournaments";
import { useNavigate } from "react-router-dom";

interface DashboardProps {
  matches: Match[];
}

interface TeamObjective {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  week_start: string;
  created_by: string;
  completed: boolean;
}

type IconComponent = ComponentType<{ className?: string }>;
type ChartTooltipProps<T> = { active?: boolean; payload?: Array<{ payload: T }> };
type MapWinRateDatum = { name: MapName; played: number; wins: number; losses: number; winRate: number };
type PistolDatum = { name: string; value: number; side: "CT" | "TR"; key: "ctPistol" | "trPistol" | "ctSecondRound" | "trSecondRound" };
type TrendDatum = { idx: number; diff: number; win: boolean; map: MapName; rival: string; date: string; score: string };

function StatCard({ icon: Icon, label, value, sub, color }: { icon: IconComponent; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="cyber-card p-4 animate-slide-up relative">
      <span className="cyber-corner cyber-corner-tl" />
      <span className="cyber-corner cyber-corner-tr" />
      <span className="cyber-corner cyber-corner-bl" />
      <span className="cyber-corner cyber-corner-br" />
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-sm", color ?? "gradient-primary")}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
          {sub && <p className="text-xs text-muted-foreground font-mono">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ matches }: DashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const playerName = user?.user_metadata?.player_name || user?.email?.split("@")[0] || "Jugador";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("team_members")
      .select("steam_avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.steam_avatar_url ?? null));
  }, [user]);
  const winRate = getWinRate(matches);
  const streak = getStreak(matches);
  const { tournaments } = useTournaments();
  const upcoming = getUpcomingTournament(tournaments);
  const upcomingDate = upcoming ? new Date(upcoming.start_date) : null;
  const daysLeft = upcomingDate ? Math.max(0, differenceInDays(upcomingDate, new Date())) : null;

  // Objectives state
  const [objectives, setObjectives] = useState<TeamObjective[]>([]);
  const [newObjective, setNewObjective] = useState("");

  useEffect(() => {
    fetchObjectives();
  }, []);

  const fetchObjectives = async () => {
    const { data } = await supabase
      .from("team_objectives")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setObjectives(data as TeamObjective[]);
  };

  const addObjective = async () => {
    if (!newObjective.trim()) return;
    await supabase.from("team_objectives").insert({
      title: newObjective.trim(),
      created_by: playerName,
      target_value: 1,
      current_value: 0,
    });
    setNewObjective("");
    fetchObjectives();
    toast.success("Objetivo agregado");
  };

  const toggleObjective = async (obj: TeamObjective) => {
    await supabase
      .from("team_objectives")
      .update({ completed: !obj.completed, current_value: obj.completed ? 0 : obj.target_value })
      .eq("id", obj.id);
    fetchObjectives();
  };

  const deleteObjective = async (id: string) => {
    await supabase.from("team_objectives").delete().eq("id", id);
    fetchObjectives();
  };

  // Map stats
  const mapData = MAPS.map((map) => {
    const mapMatches = matches.filter((m) => m.map === map);
    const wr = getWinRate(mapMatches);
    return { name: map, played: mapMatches.length, wins: mapMatches.filter(isWin).length, losses: mapMatches.filter((m) => !isWin(m)).length, winRate: wr };
  });

  const bestMap = [...mapData].filter((m) => m.played > 0).sort((a, b) => b.winRate - a.winRate)[0];
  const worstMap = [...mapData].filter((m) => m.played > 0).sort((a, b) => a.winRate - b.winRate)[0];

  const weeklyData = getWeeklyTrend(matches);


  const last10 = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

  const COLORS = { win: "#22c55e", loss: "#ef4444", ct: "#3b82f6", tr: "#d4a017", accent: "#ED7D31" };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Welcome */}
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11 border-2 border-accent/40">
          <AvatarImage src={avatarUrl ?? undefined} alt={playerName} />
          <AvatarFallback className="bg-accent/20 text-accent">
            <User className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-heading font-bold">Qué onda, <span className="text-accent">{playerName}</span> 🔥</h2>
          <p className="text-sm text-muted-foreground">Acá va el resumen del equipo</p>
      </div>

      {/* Countdown — solo si hay un torneo agendado */}
      {upcoming && upcomingDate && (
        <TournamentCountdown
          target={upcomingDate}
          name={upcoming.name}
          format={upcoming.format}
          onOpenTournaments={() => navigate("/torneos")}
        />
      )}
      </div>

      {/* Tournaments manager */}
      <TournamentsManager />

      {/* Summary */}
      <div className={cn("grid grid-cols-2 gap-4", upcoming ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatCard icon={Trophy} label="Partidos" value={matches.length} />
        <StatCard icon={Target} label="Win Rate" value={`${winRate}%`} color="gradient-accent" />
        <StatCard icon={Flame} label="Racha" value={`${streak.count}${streak.type}`} sub={streak.type === "W" ? "Victorias seguidas" : "Derrotas seguidas"} color={streak.type === "W" ? "gradient-success" : "bg-destructive"} />
        {upcoming && upcomingDate && (
          <StatCard
            icon={Timer}
            label="Días al Torneo"
            value={daysLeft ?? 0}
            sub={upcomingDate.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          />
        )}
      </div>

      {/* Team Objectives */}
      <div className="bg-card rounded-lg border border-accent/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-accent" />
          Objetivos del Equipo
        </h3>
        <div className="flex gap-2 mb-4">
          <Input
            value={newObjective}
            onChange={(e) => setNewObjective(e.target.value)}
            placeholder="Nuevo objetivo (ej: Ganar 3 pistols CT en Nuke)"
            onKeyDown={(e) => e.key === "Enter" && addObjective()}
            className="flex-1"
          />
          <Button onClick={addObjective} size="sm" className="gradient-accent text-accent-foreground">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {objectives.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin objetivos. ¡Agregá uno!</p>
        ) : (
          <ul className="space-y-2">
            {objectives.map((obj) => (
              <li key={obj.id} className={cn("flex items-center gap-3 p-2 rounded-md border border-border/50 transition-all", obj.completed && "opacity-60")}>
                <button onClick={() => toggleObjective(obj)} className={cn("h-5 w-5 rounded border flex items-center justify-center shrink-0", obj.completed ? "bg-success border-success" : "border-muted-foreground")}>
                  {obj.completed && <Check className="h-3 w-3 text-success-foreground" />}
                </button>
                <span className={cn("flex-1 text-sm", obj.completed && "line-through")}>{obj.title}</span>
                <span className="text-xs text-muted-foreground">{obj.created_by}</span>
                <button onClick={() => deleteObjective(obj.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map Win Rate — grouped Victorias / Derrotas + WR% label */}
        <MapWinRateCard matches={matches} mapData={mapData} colors={COLORS} />

        {/* Pistol & Conversión con filtros + drill-down por mapa */}
        <PistolConversionCard matches={matches} colors={COLORS} />
      </div>

      {/* Tendencia de Resultados con filtros */}
      <ResultsTrendCard matches={matches} bestMap={bestMap} worstMap={worstMap} colors={COLORS} />


      {/* Last 10 */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[9px] font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground">// ÚLTIMOS 10 PARTIDOS</h3>
        </div>
        {last10.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Sin partidos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="text-left py-2 px-2 font-heading">Fecha</th>
                  <th className="text-left py-2 px-2 font-heading">Tipo</th>
                  <th className="text-left py-2 px-2 font-heading">Mapa</th>
                  <th className="text-left py-2 px-2 font-heading">Rival</th>
                  <th className="text-center py-2 px-2 font-heading">Score</th>
                  <th className="text-center py-2 px-2 font-heading">WR vs Rival</th>
                  <th className="text-center py-2 px-2 font-heading">CT P</th>
                  <th className="text-center py-2 px-2 font-heading">TR P</th>
                  <th className="text-center py-2 px-2 font-heading">Stats</th>
                </tr>
              </thead>
              <tbody>
                {last10.map((m) => {
                  const win = isWin(m);
                  const rivalMatches = m.rival ? matches.filter((x) => x.rival?.toLowerCase() === m.rival?.toLowerCase()) : [];
                  const wrRival = rivalMatches.length ? getWinRate(rivalMatches) : null;
                  const ctPistol = (m as unknown as { ct_pistol?: boolean }).ct_pistol;
                  const trPistol = (m as unknown as { tr_pistol?: boolean }).tr_pistol;
                  return (
                    <tr key={m.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{format(new Date(m.date), "dd/MM/yy")}</td>
                      <td className="py-2.5 px-2"><span className="text-[9px] px-1.5 py-0.5 rounded-[2px] bg-accent/10 border border-accent/20 text-accent font-mono uppercase tracking-[0.06em]">{(m as unknown as { type?: string }).type || "treino"}</span></td>
                      <td className="py-2.5 px-2 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{m.map}</td>
                      <td className="py-2.5 px-2 font-semibold">{m.rival || "—"}</td>
                      <td className={cn("text-center py-2.5 px-2 font-mono font-bold", win ? "text-success" : "text-destructive")}>{m.scoreUs}-{m.scoreThem}</td>
                      <td className="text-center py-2.5 px-2 text-xs text-muted-foreground">{wrRival !== null ? `${wrRival}%` : "—"}</td>
                      <td className="text-center py-2.5 px-2">{ctPistol === undefined ? <span className="text-muted-foreground">—</span> : <span className={cn("inline-block h-2.5 w-2.5 rounded-full", ctPistol ? "bg-success" : "bg-destructive")} />}</td>
                      <td className="text-center py-2.5 px-2">{trPistol === undefined ? <span className="text-muted-foreground">—</span> : <span className={cn("inline-block h-2.5 w-2.5 rounded-full", trPistol ? "bg-success" : "bg-destructive")} />}</td>
                      <td className="text-center py-2.5 px-2">
                        {m.demo_data ? (
                          <MatchStatsDialog
                            data={m.demo_data as DemoData}
                            mode="stored"
                            meta={{ date: m.date, matchType: m.type, rival: m.rival, savedAt: m.date, scoreUs: m.scoreUs, scoreThem: m.scoreThem }}
                            trigger={<button className="text-accent hover:text-accent/80" title="Ver stats"><BarChart3 className="h-4 w-4 mx-auto" /></button>}
                          />
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getWeeklyTrend(matches: Match[]) {
  if (!matches.length) return [];
  const sorted = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weeks: Record<string, Match[]> = {};
  sorted.forEach((m) => {
    const weekStart = startOfWeek(new Date(m.date), { weekStartsOn: 1 });
    const key = format(weekStart, "dd/MM");
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(m);
  });
  return Object.entries(weeks).map(([week, wMatches]) => ({
    week: `Sem ${week}`,
    winRate: getWinRate(wMatches),
    played: wMatches.length,
  }));
}

// ============================================================================
// Sub-cards con filtros propios
// ============================================================================

type ChartColors = { win: string; loss: string; ct: string; tr: string; accent: string };

function FilterChipRow({
  filterType, setFilterType, filterMap, setFilterMap, hasMaps,
}: {
  filterType: "all" | MatchType; setFilterType: (v: "all" | MatchType) => void;
  filterMap: "all" | MapName; setFilterMap: (v: "all" | MapName) => void;
  hasMaps: MapName[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] mb-3">
      <Filter className="h-3 w-3 text-muted-foreground mr-0.5" />
      <span className="text-muted-foreground">Tipo:</span>
      {(["all", ...MATCH_TYPES] as const).map((t) => (
        <button
          key={t}
          onClick={() => setFilterType(t)}
          className={cn(
            "px-2 py-0.5 rounded-full border transition-colors",
            filterType === t
              ? "border-accent bg-accent/20 text-accent"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {t === "all" ? "Todos" : t}
        </button>
      ))}
      <span className="text-muted-foreground ml-1">Mapa:</span>
      {(["all", ...hasMaps] as const).map((m) => (
        <button
          key={m}
          onClick={() => setFilterMap(m)}
          className={cn(
            "px-2 py-0.5 rounded-full border transition-colors",
            filterMap === m
              ? "border-accent bg-accent/20 text-accent"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "all" ? "Todos" : m}
        </button>
      ))}
    </div>
  );
}

function MapWinRateCard({ matches, mapData, colors }: { matches: Match[]; mapData: MapWinRateDatum[]; colors: ChartColors }) {
  const data = mapData.filter((d) => d.played > 0);
  const MapTooltip = ({ active, payload }: ChartTooltipProps<MapWinRateDatum>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs">
        <div className="font-heading font-bold text-foreground mb-1">{d.name}</div>
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: colors.win }} /> <span className="text-muted-foreground">Victorias:</span> <span className="font-mono text-foreground">{d.wins}</span></div>
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: colors.loss }} /> <span className="text-muted-foreground">Derrotas:</span> <span className="font-mono text-foreground">{d.losses}</span></div>
        <div className="mt-1 pt-1 border-t border-border/60 flex items-center gap-2">
          <span className="text-muted-foreground">Win Rate:</span>
          <span className={cn("font-mono font-bold", d.winRate >= 50 ? "text-success" : "text-destructive")}>{d.winRate}%</span>
          <span className="text-muted-foreground">({d.played} jugados)</span>
        </div>
      </div>
    );
  };
  return (
    <div className="bg-card rounded-lg border border-border p-6 card-glow">
      <h3 className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground mb-3">Win Rate por Mapa</h3>
      {matches.length === 0 || data.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Sin datos aún. ¡Registrá tu primer treino!</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap="30%" margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(220 16% 18%)" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(215 15% 55%)" fontSize={12} />
                <YAxis stroke="hsl(215 15% 55%)" fontSize={12} allowDecimals={false} />
                <Tooltip content={<MapTooltip />} cursor={{ fill: "hsl(220 16% 18% / 0.4)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
                <Bar dataKey="wins" name="Victorias" fill={colors.win} radius={[2, 2, 0, 0]}>
                  <LabelList
                    dataKey="winRate"
                    position="top"
                    formatter={(v: number) => `${v}%`}
                    style={{ fill: "hsl(210 20% 92%)", fontSize: 10, fontWeight: 700 }}
                  />
                </Bar>
                <Bar dataKey="losses" name="Derrotas" fill={colors.loss} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            {data.map((d) => (
              <div key={d.name} className="flex items-center justify-between rounded border border-border/40 bg-muted/10 px-2 py-1">
                <span className="text-muted-foreground">{d.name}</span>
                <span className={cn("font-mono font-bold", d.winRate >= 50 ? "text-success" : "text-destructive")}>{d.winRate}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PistolConversionCard({ matches, colors }: { matches: Match[]; colors: ChartColors }) {
  const [filterType, setFilterType] = useState<"all" | MatchType>("all");
  const [filterMap, setFilterMap] = useState<"all" | MapName>("all");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const availableMaps = useMemo(
    () => MAPS.filter((mp) => matches.some((m) => m.map === mp)),
    [matches],
  );

  const filtered = useMemo(() => matches.filter((m) => {
    if (filterType !== "all" && m.type !== filterType) return false;
    if (filterMap !== "all" && m.map !== filterMap) return false;
    return true;
  }), [matches, filterType, filterMap]);

  const pistolData = [
    { name: "CT Pistol", value: getPistolRate(filtered, "CT"), side: "CT", key: "ctPistol" },
    { name: "TR Pistol", value: getPistolRate(filtered, "TR"), side: "TR", key: "trPistol" },
    { name: "CT 2nd Rd", value: getConversionRate(filtered, "CT"), side: "CT", key: "ctSecondRound" },
    { name: "TR 2nd Rd", value: getConversionRate(filtered, "TR"), side: "TR", key: "trSecondRound" },
  ] as const;

  const PistolTooltip = ({ active, payload }: ChartTooltipProps<PistolDatum>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const key = d.key as "ctPistol" | "trPistol" | "ctSecondRound" | "trSecondRound";
    const wins = filtered.filter((m) => m[key] === "WIN").length;
    const barColor = d.side === "CT" ? colors.ct : colors.tr;
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs min-w-[160px]">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: barColor }} />
          <span className="font-heading font-bold text-foreground">{d.name}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Win Rate</span>
          <span className={cn("font-mono font-bold", d.value >= 50 ? "text-success" : "text-destructive")}>{d.value}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Ganados</span>
          <span className="font-mono text-foreground">{wins} / {filtered.length}</span>
        </div>
      </div>
    );
  };

  // Per-map breakdown for the drill-down
  const perMap = availableMaps.map((mp) => {
    const rows = filtered.filter((m) => m.map === mp);
    return {
      map: mp,
      played: rows.length,
      ctPistol: getPistolRate(rows, "CT"),
      trPistol: getPistolRate(rows, "TR"),
      ctConv: getConversionRate(rows, "CT"),
      trConv: getConversionRate(rows, "TR"),
    };
  }).filter((r) => r.played > 0);

  return (
    <div className="bg-card rounded-lg border border-border p-6 card-glow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground">Pistol & Conversión</h3>
        <button
          onClick={() => setShowBreakdown((v) => !v)}
          className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-accent hover:border-accent transition-colors"
        >
          {showBreakdown ? "Ocultar detalle" : "Ver por mapa"}
        </button>
      </div>
      <FilterChipRow filterType={filterType} setFilterType={setFilterType} filterMap={filterMap} setFilterMap={setFilterMap} hasMaps={availableMaps} />
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Sin datos para este filtro</p>
      ) : (
        <>
          <div className="h-64 cursor-pointer" onClick={() => setShowBreakdown(true)} title="Click para ver detalle por mapa">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...pistolData]} layout="vertical" barCategoryGap="30%">
                <CartesianGrid stroke="hsl(220 16% 18%)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="hsl(215 15% 55%)" fontSize={11} width={80} />
                <Tooltip content={<PistolTooltip />} cursor={{ fill: "hsl(220 16% 18% / 0.4)" }} />
                <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                  {pistolData.map((entry, i) => (
                    <Cell key={i} fill={entry.side === "CT" ? colors.ct : colors.tr} />
                  ))}
                  <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} style={{ fill: "hsl(210 20% 92%)", fontSize: 10, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: colors.ct }} /> CT</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: colors.tr }} /> T</span>
            <span className="ml-2">· {filtered.length} partido{filtered.length === 1 ? "" : "s"}</span>
          </div>
        </>
      )}

      {showBreakdown && filtered.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Desglose por mapa</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground bg-muted/20">
                <tr>
                  <th className="px-2 py-1.5 text-left">Mapa</th>
                  <th className="px-2 py-1.5 text-right">Jugados</th>
                  <th className="px-2 py-1.5 text-right"><span className="text-blue-400">CT Pistol</span></th>
                  <th className="px-2 py-1.5 text-right"><span className="text-yellow-400">T Pistol</span></th>
                  <th className="px-2 py-1.5 text-right"><span className="text-blue-400">CT 2nd</span></th>
                  <th className="px-2 py-1.5 text-right"><span className="text-yellow-400">T 2nd</span></th>
                </tr>
              </thead>
              <tbody>
                {perMap.map((r) => (
                  <tr key={r.map} className="border-t border-border/40">
                    <td className="px-2 py-1.5 font-medium">{r.map}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground font-mono">{r.played}</td>
                    <PctCell v={r.ctPistol} />
                    <PctCell v={r.trPistol} />
                    <PctCell v={r.ctConv} />
                    <PctCell v={r.trConv} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Filtrá por tipo/mapa arriba para acotar el análisis.</p>
        </div>
      )}
    </div>
  );
}

function PctCell({ v }: { v: number }) {
  return (
    <td className={cn("px-2 py-1.5 text-right font-mono font-bold", v >= 50 ? "text-success" : v > 0 ? "text-destructive" : "text-muted-foreground")}>
      {v}%
    </td>
  );
}

function ResultsTrendCard({ matches, bestMap, worstMap, colors }: { matches: Match[]; bestMap: MapWinRateDatum | undefined; worstMap: MapWinRateDatum | undefined; colors: ChartColors }) {
  const [filterType, setFilterType] = useState<"all" | MatchType>("all");
  const [filterMap, setFilterMap] = useState<"all" | MapName>("all");

  const availableMaps = useMemo(
    () => MAPS.filter((mp) => matches.some((m) => m.map === mp)),
    [matches],
  );

  const filtered = useMemo(() => matches.filter((m) => {
    if (filterType !== "all" && m.type !== filterType) return false;
    if (filterMap !== "all" && m.map !== filterMap) return false;
    return true;
  }), [matches, filterType, filterMap]);

  const trendMatches = [...filtered]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);
  let running = 0;
  const trendData: TrendDatum[] = trendMatches.map((m, i) => {
    running += isWin(m) ? 1 : -1;
    return { idx: i + 1, diff: running, win: isWin(m), map: m.map, rival: m.rival, date: m.date, score: `${m.scoreUs}-${m.scoreThem}` };
  });
  const wlDiff = trendData.length ? trendData[trendData.length - 1].diff : 0;
  const wins = filtered.filter(isWin).length;
  const losses = filtered.length - wins;
  let longest = 0, cur = 0, curType: "W" | "L" | null = null;
  [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((m) => {
    const t = isWin(m) ? "W" : "L";
    if (t === curType) cur++; else { curType = t; cur = 1; }
    if (cur > longest) longest = cur;
  });

  const TrendTooltip = ({ active, payload }: ChartTooltipProps<TrendDatum>) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg text-xs">
        <div className="font-heading font-bold text-foreground">{d.map} · <span className={d.win ? "text-success" : "text-destructive"}>{d.win ? "Win" : "Loss"}</span></div>
        <div className="text-muted-foreground">{d.rival || "—"} · <span className="font-mono">{d.score}</span></div>
        <div className="text-muted-foreground">{format(new Date(d.date), "dd/MM/yy")}</div>
        <div className="mt-1 pt-1 border-t border-border/60">Diff acumulada: <span className={cn("font-mono font-bold", d.diff >= 0 ? "text-success" : "text-destructive")}>{d.diff >= 0 ? `+${d.diff}` : d.diff}</span></div>
      </div>
    );
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 card-glow">
      <h3 className="text-xs font-heading font-bold uppercase tracking-widest text-muted-foreground mb-3">Tendencia de Resultados</h3>
      <FilterChipRow filterType={filterType} setFilterType={setFilterType} filterMap={filterMap} setFilterMap={setFilterMap} hasMaps={availableMaps} />
      {trendData.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Sin datos para este filtro</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,220px] gap-6 items-center">
          <div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.accent} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={colors.accent} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(220 16% 18%)" vertical={false} />
                  <XAxis dataKey="idx" hide />
                  <YAxis stroke="hsl(215 15% 55%)" fontSize={12} allowDecimals={false} />
                  <ReferenceLine y={0} stroke="hsl(215 15% 45%)" strokeDasharray="2 2" />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: colors.accent, strokeOpacity: 0.4 }} />
                  <Area type="monotone" dataKey="diff" stroke={colors.accent} strokeWidth={3} fill="url(#trendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-1 mt-2">
              {trendData.map((d, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: d.win ? colors.win : colors.loss }} title={`${d.map} · ${d.win ? "Win" : "Loss"}`} />
              ))}
            </div>
          </div>
          <div className="space-y-4 border-l border-border/60 pl-6">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-success/20 text-success text-xs font-bold">W {wins}</span>
              <span className="text-muted-foreground">/</span>
              <span className="px-2 py-0.5 rounded-md bg-destructive/20 text-destructive text-xs font-bold">L {losses}</span>
            </div>
            <div className={cn("h-16 w-16 rounded-full border-4 flex items-center justify-center font-heading font-bold text-2xl", wlDiff >= 0 ? "border-success text-success" : "border-destructive text-destructive")}>
              {wlDiff >= 0 ? `+${wlDiff}` : wlDiff}
            </div>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Diferencia W/L</span><span className={cn("font-bold", wlDiff >= 0 ? "text-success" : "text-destructive")}>{wlDiff >= 0 ? `+${wlDiff}` : wlDiff}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Win Rate</span><span className={cn("font-bold", getWinRate(filtered) >= 50 ? "text-success" : "text-destructive")}>{getWinRate(filtered)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Racha más larga 🔥</span><span className="font-bold text-foreground">{longest}</span></div>
            </div>
            {filterMap === "all" && filterType === "all" && (bestMap || worstMap) && (
              <div className="pt-3 border-t border-border/60 text-[11px] space-y-1">
                {bestMap && <div className="text-success">💪 {bestMap.name} · {bestMap.winRate}%</div>}
                {worstMap && worstMap !== bestMap && <div className="text-destructive">⚠️ {worstMap.name} · {worstMap.winRate}%</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

