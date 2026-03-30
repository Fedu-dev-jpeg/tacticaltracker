import { Match, MAPS } from "@/types/match";
import { getWinRate, getPistolRate, getConversionRate, isWin } from "@/hooks/useMatches";
import { Target, AlertTriangle, ClipboardList } from "lucide-react";

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

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-slide-up">
      {/* Strengths */}
      <div className="bg-card rounded-lg border border-success/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-success mb-4">
          🎯 PUNTOS FUERTES
        </h3>
        <ul className="space-y-2 text-sm">
          {bestMap && <li>✅ Mapa más fuerte: <strong>{bestMap.name}</strong> ({bestMap.winRate}% WR)</li>}
          <li>✅ Lado más fuerte: <strong>{strongSide}</strong> (Pistol {Math.max(ctPistol, trPistol)}%)</li>
          <li>✅ Mejor pistol: <strong>{ctPistol >= trPistol ? "CT" : "TR"}</strong> ({Math.max(ctPistol, trPistol)}%)</li>
        </ul>
      </div>

      {/* Weaknesses */}
      <div className="bg-card rounded-lg border border-destructive/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-destructive mb-4">
          ⚠️ ÁREAS A MEJORAR
        </h3>
        <ul className="space-y-2 text-sm">
          {worstMap && <li>❌ Mapa a mejorar: <strong>{worstMap.name}</strong> ({worstMap.winRate}% WR)</li>}
          <li>❌ Lado más débil: <strong>{weakSide}</strong> (Pistol {Math.min(ctPistol, trPistol)}%)</li>
          {ctConv < 60 && <li>🔴 Conversión 2nd round CT baja: {ctConv}%</li>}
          {trConv < 60 && <li>🔴 Conversión 2nd round TR baja: {trConv}%</li>}
          {ctPistol < 40 && <li>🔴 Pistol CT muy bajo: {ctPistol}%</li>}
          {trPistol < 40 && <li>🔴 Pistol TR muy bajo: {trPistol}%</li>}
        </ul>
      </div>

      {/* Recommendations */}
      <div className="bg-card rounded-lg border border-accent/30 p-6 card-glow">
        <h3 className="text-lg font-heading font-bold flex items-center gap-2 text-accent mb-4">
          📋 RECOMENDACIONES PARA PRÓXIMO TREINO
        </h3>
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
