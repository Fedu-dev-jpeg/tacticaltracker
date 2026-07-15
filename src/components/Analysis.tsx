import { useMemo, useState } from "react";
import { Match, MAPS, MATCH_TYPES, MatchType } from "@/types/match";
import { getWinRate, getPistolRate, getConversionRate, isWin } from "@/hooks/useMatches";
import { Activity, CheckCircle2, Crosshair, Filter, LineChart as LineChartIcon, Target, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface AnalysisProps {
  matches: Match[];
}

export default function Analysis({ matches }: AnalysisProps) {
  const [selectedTypes, setSelectedTypes] = useState<Record<MatchType, boolean>>({
    Treino: true,
    Oficial: true,
    Scrim: true,
  });

  const activeTypes = MATCH_TYPES.filter((type) => selectedTypes[type]);
  const filtered = useMemo(
    () => matches.filter((match) => selectedTypes[match.type]),
    [matches, selectedTypes],
  );

  if (matches.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground animate-slide-up">
        <Target className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-heading">Sin datos para analizar</p>
        <p className="text-sm">Registra tu primer treino para ver el análisis</p>
      </div>
    );
  }

  const mapStats = MAPS.map((map) => {
    const mm = filtered.filter((m) => m.map === map);
    const wins = mm.filter(isWin).length;
    return {
      name: map,
      count: mm.length,
      wins,
      losses: mm.length - wins,
      winRate: getWinRate(mm),
      ctPistol: getPistolRate(mm, "CT"),
      trPistol: getPistolRate(mm, "TR"),
      ctConv: getConversionRate(mm, "CT"),
      trConv: getConversionRate(mm, "TR"),
    };
  });

  const wins = filtered.filter(isWin).length;
  const losses = filtered.length - wins;
  const winRate = getWinRate(filtered);
  const ctPistol = getPistolRate(filtered, "CT");
  const trPistol = getPistolRate(filtered, "TR");
  const ctConv = getConversionRate(filtered, "CT");
  const trConv = getConversionRate(filtered, "TR");
  const avgDiff = filtered.length
    ? Math.round((filtered.reduce((sum, match) => sum + (match.scoreUs - match.scoreThem), 0) / filtered.length) * 10) / 10
    : 0;

  const bestMap = [...mapStats].filter((m) => m.count > 0).sort((a, b) => b.winRate - a.winRate)[0];
  const worstMap = [...mapStats].filter((m) => m.count > 0).sort((a, b) => a.winRate - b.winRate)[0];

  const overallData = [
    { metric: "Pistol", CT: ctPistol, TR: trPistol },
    { metric: "Conversión 2nd", CT: ctConv, TR: trConv },
  ];

  const trendData = [...filtered]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12)
    .map((match, index) => ({
      idx: index + 1,
      date: new Date(match.date).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
      diff: match.scoreUs - match.scoreThem,
      us: match.scoreUs,
      them: match.scoreThem,
      win: isWin(match) ? 1 : 0,
      type: match.type,
      map: match.map,
    }));

  const recommendations: string[] = [];
  if (ctPistol < 50) recommendations.push("Practicar pistol setups CT");
  if (trPistol < 50) recommendations.push("Practicar pistol setups TR");
  if (ctConv < 60) recommendations.push("Trabajar anti-eco CT (conversión 2nd round)");
  if (trConv < 60) recommendations.push("Trabajar anti-eco TR (conversión 2nd round)");
  const playedMapStats = mapStats.filter((m) => m.count > 0);
  const lowVolumeMaps = playedMapStats.filter((m) => m.count < 3).sort((a, b) => a.count - b.count);
  const urgentMaps = playedMapStats.filter((m) => m.winRate < 45).sort((a, b) => a.winRate - b.winRate);
  urgentMaps.forEach((m) => recommendations.push(`Foco mapa: ${m.name} (${m.winRate}% WR en ${m.count} partidos)`));
  lowVolumeMaps.slice(0, 2).forEach((m) => recommendations.push(`Sumar volumen controlado en ${m.name} (${m.count}/3 partidos mínimos)`));
  playedMapStats.forEach((d) => {
    if (d.ctPistol < 40) recommendations.push(`CT Pistol muy bajo en ${d.name} (${d.ctPistol}%)`);
    if (d.trPistol < 40) recommendations.push(`TR Pistol muy bajo en ${d.name} (${d.trPistol}%)`);
  });
  const nextTrainingMaps = [...playedMapStats]
    .sort((a, b) => {
      const aScore = (a.winRate < 45 ? 0 : 20) + a.count * 4 + Math.min(a.ctPistol, a.trPistol);
      const bScore = (b.winRate < 45 ? 0 : 20) + b.count * 4 + Math.min(b.ctPistol, b.trPistol);
      return aScore - bScore;
    })
    .slice(0, 3);

  const COLORS = { ct: "#1F4E79", tr: "#0088FF", success: "#70AD47", danger: "#e74c3c", accent: "#00B7FF" };
  const chartTheme = {
    backgroundColor: "hsl(220 18% 12%)",
    border: "1px solid hsl(220 16% 18%)",
    borderRadius: "8px",
    color: "hsl(210 20% 92%)",
  };

  const toggleType = (type: MatchType) => {
    setSelectedTypes((current) => {
      const enabledCount = Object.values(current).filter(Boolean).length;
      if (current[type] && enabledCount === 1) return current;
      return { ...current, [type]: !current[type] };
    });
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide">Stats Dashboard</h1>
          <p className="text-sm text-muted-foreground">Lectura horizontal de rendimiento, mapas, lados y fuentes de datos.</p>
        </div>
        <Card className="border-border bg-card/70">
          <CardContent className="p-3 flex items-center gap-4">
            <Filter className="h-4 w-4 text-accent" />
            {MATCH_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <Checkbox checked={selectedTypes[type]} onCheckedChange={() => toggleType(type)} />
                {type}
                <span className="text-muted-foreground">({matches.filter((m) => m.type === type).length})</span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-heading">Sin partidos para las fuentes seleccionadas</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <MetricCard label="Partidas" value={filtered.length} detail={`${wins}W / ${losses}L`} icon={Activity} />
            <MetricCard label="Win rate" value={`${winRate}%`} detail={activeTypes.join(" + ")} icon={TrendingUp} tone={winRate >= 50 ? "success" : "danger"} />
            <MetricCard label="Diff promedio" value={avgDiff > 0 ? `+${avgDiff}` : avgDiff} detail="rounds por partida" icon={Crosshair} tone={avgDiff >= 0 ? "success" : "danger"} />
            <MetricCard label="Mejor mapa" value={bestMap?.name ?? "-"} detail={bestMap ? `${bestMap.winRate}% WR` : "sin datos"} icon={Target} />
            <MetricCard label="Mapa foco" value={worstMap?.name ?? "-"} detail={worstMap ? `${worstMap.winRate}% WR` : "sin datos"} icon={LineChartIcon} tone="danger" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="card-glow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tendencia ultimas 12 partidas</CardTitle>
              </CardHeader>
              <CardContent className="h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="diffGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(220 16% 18%)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="hsl(215 15% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(215 15% 55%)" fontSize={12} />
                    <Tooltip contentStyle={chartTheme} />
                    <Area type="monotone" dataKey="diff" name="Diff rounds" stroke={COLORS.accent} fill="url(#diffGradient)" strokeWidth={2} />
                    <Line type="monotone" dataKey="win" name="Win" stroke={COLORS.success} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-glow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">CT / TR global</CardTitle>
              </CardHeader>
              <CardContent className="h-[310px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={overallData}>
                    <CartesianGrid stroke="hsl(220 16% 18%)" strokeDasharray="3 3" />
                    <XAxis dataKey="metric" stroke="hsl(215 15% 55%)" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
                    <Tooltip contentStyle={chartTheme} />
                    <Legend />
                    <Bar dataKey="CT" fill={COLORS.ct} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="TR" fill={COLORS.tr} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="CT" stroke={COLORS.ct} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="card-glow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mapa por mapa</CardTitle>
              </CardHeader>
              <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mapStats} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid stroke="hsl(220 16% 18%)" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(215 15% 55%)" fontSize={12} width={75} />
                    <Tooltip contentStyle={chartTheme} />
                    <Legend />
                    <Bar dataKey="winRate" name="Win rate" radius={[0, 4, 4, 0]}>
                      {mapStats.map((entry) => (
                        <Cell key={entry.name} fill={entry.winRate >= 55 ? COLORS.success : entry.winRate >= 40 ? COLORS.accent : COLORS.danger} />
                      ))}
                    </Bar>
                    <Bar dataKey="count" name="Volumen" fill="hsl(220 12% 38%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-glow border-accent/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  Lectura para el proximo treino
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <MiniRead label="CT pistol" value={`${ctPistol}%`} good={ctPistol >= 50} />
                  <MiniRead label="TR pistol" value={`${trPistol}%`} good={trPistol >= 50} />
                  <MiniRead label="CT conversion" value={`${ctConv}%`} good={ctConv >= 60} />
                  <MiniRead label="TR conversion" value={`${trConv}%`} good={trConv >= 60} />
                </div>
                {nextTrainingMaps.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Mapa foco sugerido</div>
                    {nextTrainingMaps.map((m) => (
                      <div key={m.name} className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-foreground">{m.name}</strong>
                          <span className={m.winRate >= 50 ? "text-success" : "text-destructive"}>{m.winRate}% WR</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {m.count} partidos · CT pistol {m.ctPistol}% · TR pistol {m.trPistol}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todo se ve estable. Mantener el ritmo y sumar volumen por mapa.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {recommendations.slice(0, 8).map((r, i) => (
                      <li key={i} className="rounded-md border border-border bg-card/60 px-3 py-2">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: "accent" | "success" | "danger";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-accent";
  return (
    <Card className="card-glow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
          <Icon className={cn("h-4 w-4", toneClass)} />
        </div>
        <div className={cn("mt-2 text-2xl font-heading font-bold", toneClass)}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground truncate">{detail}</div>
      </CardContent>
    </Card>
  );
}

function MiniRead({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/70 p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-heading font-bold", good ? "text-success" : "text-destructive")}>{value}</div>
    </div>
  );
}
