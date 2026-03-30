import { Match, MAPS } from "@/types/match";
import { getWinRate, getPistolRate, getConversionRate, isWin } from "@/hooks/useMatches";
import { Target, Shield, Sword } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";

interface AnalysisProps {
  matches: Match[];
}

export default function Analysis({ matches }: AnalysisProps) {
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
    const mm = matches.filter((m) => m.map === map);
    return { name: map, count: mm.length, winRate: getWinRate(mm) };
  });

  const ctPistol = getPistolRate(matches, "CT");
  const trPistol = getPistolRate(matches, "TR");
  const ctConv = getConversionRate(matches, "CT");
  const trConv = getConversionRate(matches, "TR");

  const bestMap = [...mapStats].filter((m) => m.count > 0).sort((a, b) => b.winRate - a.winRate)[0];
  const worstMap = [...mapStats].filter((m) => m.count > 0).sort((a, b) => a.winRate - b.winRate)[0];
  const strongSide = ctPistol >= trPistol ? "CT" : "TR";
  const weakSide = ctPistol < trPistol ? "CT" : "TR";

  // CT vs TR side data per map
  const ctTrData = MAPS.map((map) => {
    const mm = matches.filter((m) => m.map === map);
    if (mm.length === 0) return { name: map, ctPistol: 0, trPistol: 0, ctConv: 0, trConv: 0 };
    return {
      name: map,
      ctPistol: getPistolRate(mm, "CT"),
      trPistol: getPistolRate(mm, "TR"),
      ctConv: getConversionRate(mm, "CT"),
      trConv: getConversionRate(mm, "TR"),
    };
  }).filter((d) => matches.some((m) => m.map === d.name));

  // Overall CT vs TR comparison
  const ctWins = matches.filter((m) => m.ctPistol === "WIN").length;
  const trWins = matches.filter((m) => m.trPistol === "WIN").length;
  const overallData = [
    { metric: "Pistol", CT: ctPistol, TR: trPistol },
    { metric: "Conversión 2nd", CT: ctConv, TR: trConv },
  ];

  // Recommendations
  const recommendations: string[] = [];
  if (ctPistol < 50) recommendations.push("Practicar pistol setups CT");
  if (trPistol < 50) recommendations.push("Practicar pistol setups TR");
  if (ctConv < 60) recommendations.push("Trabajar anti-eco CT (conversión 2nd round)");
  if (trConv < 60) recommendations.push("Trabajar anti-eco TR (conversión 2nd round)");
  mapStats.forEach((m) => {
    if (m.count < 3 && m.count > 0) recommendations.push(`Necesitan más práctica en ${m.name} (solo ${m.count} partidos)`);
    if (m.count === 0) recommendations.push(`Sin partidos en ${m.name} — priorizar`);
    if (m.winRate < 40 && m.count > 0) recommendations.push(`Foco urgente en ${m.name} (${m.winRate}% WR)`);
  });

  // Identify weak sides per map
  ctTrData.forEach((d) => {
    if (d.ctPistol < 40) recommendations.push(`CT Pistol muy bajo en ${d.name} (${d.ctPistol}%)`);
    if (d.trPistol < 40) recommendations.push(`TR Pistol muy bajo en ${d.name} (${d.trPistol}%)`);
  });

  const COLORS = { ct: "#1F4E79", tr: "#ED7D31", success: "#70AD47", danger: "#e74c3c" };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-slide-up">
      {/* Strengths */}
      <div className="bg-card rounded-lg border border-success/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-success mb-4">🎯 PUNTOS FUERTES</h3>
        <ul className="space-y-2 text-sm">
          {bestMap && <li>✅ Mapa más fuerte: <strong>{bestMap.name}</strong> ({bestMap.winRate}% WR)</li>}
          <li>✅ Lado más fuerte: <strong>{strongSide}</strong> (Pistol {Math.max(ctPistol, trPistol)}%)</li>
          <li>✅ Mejor pistol: <strong>{ctPistol >= trPistol ? "CT" : "TR"}</strong> ({Math.max(ctPistol, trPistol)}%)</li>
        </ul>
      </div>

      {/* Weaknesses */}
      <div className="bg-card rounded-lg border border-destructive/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-destructive mb-4">⚠️ ÁREAS A MEJORAR</h3>
        <ul className="space-y-2 text-sm">
          {worstMap && <li>❌ Mapa a mejorar: <strong>{worstMap.name}</strong> ({worstMap.winRate}% WR)</li>}
          <li>❌ Lado más débil: <strong>{weakSide}</strong> (Pistol {Math.min(ctPistol, trPistol)}%)</li>
          {ctConv < 60 && <li>🔴 Conversión 2nd round CT baja: {ctConv}%</li>}
          {trConv < 60 && <li>🔴 Conversión 2nd round TR baja: {trConv}%</li>}
          {ctPistol < 40 && <li>🔴 Pistol CT muy bajo: {ctPistol}%</li>}
          {trPistol < 40 && <li>🔴 Pistol TR muy bajo: {trPistol}%</li>}
        </ul>
      </div>

      {/* CT vs TR Performance Chart */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <Sword className="h-5 w-5 text-accent" />
          Rendimiento CT vs TR
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overallData}>
              <XAxis dataKey="metric" stroke="hsl(215 15% 55%)" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
              <Legend />
              <Bar dataKey="CT" fill={COLORS.ct} radius={[4, 4, 0, 0]} />
              <Bar dataKey="TR" fill={COLORS.tr} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CT vs TR by Map */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Pistol por Lado & Mapa</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ctTrData}>
              <XAxis dataKey="name" stroke="hsl(215 15% 55%)" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
              <Legend />
              <Bar dataKey="ctPistol" name="CT Pistol" fill={COLORS.ct} radius={[4, 4, 0, 0]} />
              <Bar dataKey="trPistol" name="TR Pistol" fill={COLORS.tr} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Conversion by Map */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Conversión 2nd Round por Mapa</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ctTrData}>
              <XAxis dataKey="name" stroke="hsl(215 15% 55%)" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="hsl(215 15% 55%)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", color: "hsl(210 20% 92%)" }} />
              <Legend />
              <Bar dataKey="ctConv" name="CT Conversión" fill={COLORS.ct} radius={[4, 4, 0, 0]} />
              <Bar dataKey="trConv" name="TR Conversión" fill={COLORS.tr} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-card rounded-lg border border-accent/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-accent mb-4">📋 RECOMENDACIONES PARA PRÓXIMO TREINO</h3>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">¡Todo se ve bien! Mantener el ritmo de práctica.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recommendations.map((r, i) => (
              <li key={i}>→ {r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
