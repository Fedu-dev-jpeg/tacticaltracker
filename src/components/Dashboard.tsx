import { useState, useEffect } from "react";
import { Match, MAPS, TOURNAMENT_DATE } from "@/types/match";
import { isWin, getWinRate, getStreak, getPistolRate, getConversionRate } from "@/hooks/useMatches";
import { differenceInDays, startOfWeek, format } from "date-fns";
import { Trophy, Target, TrendingUp, Timer, Flame, User, Plus, Check, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 card-glow animate-slide-up">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", color ?? "gradient-primary")}>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ matches }: DashboardProps) {
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
  const daysLeft = Math.max(0, differenceInDays(TOURNAMENT_DATE, new Date()));

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

  const pistolData = [
    { name: "CT Pistol", value: getPistolRate(matches, "CT"), side: "CT" },
    { name: "TR Pistol", value: getPistolRate(matches, "TR"), side: "TR" },
    { name: "CT 2nd Rd", value: getConversionRate(matches, "CT"), side: "CT" },
    { name: "TR 2nd Rd", value: getConversionRate(matches, "TR"), side: "TR" },
  ];

  const weeklyData = getWeeklyTrend(matches);

  // Result trend: recent matches diff (+1 win / -1 loss cumulative)
  const trendMatches = [...matches]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);
  let running = 0;
  const trendData = trendMatches.map((m, i) => {
    running += isWin(m) ? 1 : -1;
    return { idx: i + 1, diff: running, win: isWin(m) };
  });
  const wlDiff = trendData.length ? trendData[trendData.length - 1].diff : 0;
  const wins = matches.filter(isWin).length;
  const losses = matches.length - wins;
  // longest streak
  let longest = 0, cur = 0, curType: "W" | "L" | null = null;
  [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((m) => {
    const t = isWin(m) ? "W" : "L";
    if (t === curType) cur++; else { curType = t; cur = 1; }
    if (cur > longest) longest = cur;
  });

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
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Trophy} label="Partidos" value={matches.length} />
        <StatCard icon={Target} label="Win Rate" value={`${winRate}%`} color="gradient-accent" />
        <StatCard icon={Flame} label="Racha" value={`${streak.count}${streak.type}`} sub={streak.type === "W" ? "Victorias seguidas" : "Derrotas seguidas"} color={streak.type === "W" ? "gradient-success" : "bg-destructive"} />
        <StatCard icon={Timer} label="Días al Torneo" value={daysLeft} sub="25/04/2026 15:00" />
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

      {/* Map Win Rate */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Win Rate por Mapa</h3>
        {matches.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Sin datos aún. ¡Registra tu primer treino!</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mapData}>
                  <XAxis dataKey="name" stroke="hsl(215 15% 55%)" fontSize={12} />
                  <YAxis stroke="hsl(215 15% 55%)" fontSize={12} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
                  <Bar dataKey="winRate" name="Win %" radius={[6, 6, 0, 0]}>
                    {mapData.map((entry) => (
                      <Cell key={entry.name} fill={entry.winRate >= 50 ? COLORS.win : COLORS.loss} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              {bestMap && <span className="text-success">💪 Más fuerte: {bestMap.name} ({bestMap.winRate}%)</span>}
              {worstMap && worstMap !== bestMap && <span className="text-destructive">⚠️ A mejorar: {worstMap.name} ({worstMap.winRate}%)</span>}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pistol */}
        <div className="bg-card rounded-lg border border-border p-6 card-glow">
          <h3 className="text-lg font-heading font-bold mb-4">Pistol & Conversión</h3>
          {matches.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sin datos</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pistolData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="hsl(215 15% 55%)" fontSize={11} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
                  <Bar dataKey="value" name="%" radius={[0, 6, 6, 0]}>
                    {pistolData.map((entry, i) => (
                      <Cell key={i} fill={i < 2 ? COLORS.primary : COLORS.accent} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Weekly Trend */}
        <div className="bg-card rounded-lg border border-border p-6 card-glow">
          <h3 className="text-lg font-heading font-bold mb-4">Tendencia Semanal</h3>
          {weeklyData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sin datos</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" />
                  <XAxis dataKey="week" stroke="hsl(215 15% 55%)" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
                  <Line type="monotone" dataKey="winRate" stroke={COLORS.accent} strokeWidth={3} dot={{ fill: COLORS.accent, r: 5 }} name="Win %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Last 10 */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Últimos 10 Partidos</h3>
        {last10.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Sin partidos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Mapa</th>
                  <th className="text-left py-2 px-2">Rival</th>
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-center py-2 px-2">W/L</th>
                  <th className="text-left py-2 px-2">Registró</th>
                </tr>
              </thead>
              <tbody>
                {last10.map((m) => {
                  const win = isWin(m);
                  return (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-2 px-2">{format(new Date(m.date), "dd/MM")}</td>
                      <td className="py-2 px-2">{m.map}</td>
                      <td className="py-2 px-2 text-muted-foreground">{m.rival || "—"}</td>
                      <td className="text-center py-2 px-2 font-mono font-semibold">{m.scoreUs}-{m.scoreThem}</td>
                      <td className={cn("text-center py-2 px-2 font-bold", win ? "text-success" : "text-destructive")}>{win ? "W" : "L"}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">{m.recorded_by || "—"}</td>
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
