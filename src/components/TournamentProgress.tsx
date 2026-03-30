import { Match, MAPS, TOURNAMENT_DATE } from "@/types/match";
import { getWinRate } from "@/hooks/useMatches";
import { differenceInDays, differenceInWeeks, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";

interface TournamentProps {
  matches: Match[];
}

const OBJECTIVES = [
  { week: 1, label: "Sem 1: Fundamentos", desc: "Posiciones, defaults, comunicación básica" },
  { week: 2, label: "Sem 2: Economía", desc: "Pistols, forces, anti-ecos" },
  { week: 3, label: "Sem 3: Situaciones", desc: "Retakes, postplant, clutches" },
  { week: 4, label: "Sem 4: Match Ready", desc: "Ensayo general, mentalidad competitiva" },
];

export default function TournamentProgress({ matches }: TournamentProps) {
  const now = new Date();
  const daysLeft = Math.max(0, differenceInDays(TOURNAMENT_DATE, now));
  const totalDays = 28; // 4 weeks
  const trainingStart = new Date(TOURNAMENT_DATE);
  trainingStart.setDate(trainingStart.getDate() - totalDays);
  const daysPassed = Math.max(0, differenceInDays(now, trainingStart));
  const progress = Math.min(100, Math.round((daysPassed / totalDays) * 100));
  const currentWeek = Math.min(4, Math.ceil(daysPassed / 7) || 1);

  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem("hambrientos_objectives");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const toggleCheck = (week: number) => {
    const next = { ...checked, [week]: !checked[week] };
    setChecked(next);
    localStorage.setItem("hambrientos_objectives", JSON.stringify(next));
  };

  // Map readiness
  const mapStatus = MAPS.map((map) => {
    const mm = matches.filter((m) => m.map === map);
    const wr = getWinRate(mm);
    let status: "red" | "yellow" | "green" = "red";
    if (mm.length >= 3 && wr >= 50) status = "green";
    else if (mm.length >= 2 || wr >= 40) status = "yellow";
    return { name: map, count: mm.length, winRate: wr, status };
  });

  const statusEmoji = { red: "🔴", yellow: "🟡", green: "🟢" };
  const statusLabel = { red: "Débil", yellow: "En progreso", green: "Listo" };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
      {/* Countdown */}
      <div className="bg-card rounded-lg border border-accent/30 p-6 text-center card-glow">
        <p className="stat-label mb-2">Días para el torneo</p>
        <p className="text-6xl font-heading font-bold text-accent animate-pulse-glow">{daysLeft}</p>
        <p className="text-sm text-muted-foreground mt-2">25/04/2026 · 15:00h</p>
      </div>

      {/* Progress bar */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <div className="flex justify-between text-sm mb-2">
          <span className="stat-label">Progreso de preparación</span>
          <span className="font-heading font-bold text-accent">{progress}%</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div className="h-full gradient-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Semana {currentWeek} de 4</p>
      </div>

      {/* Checklist */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Objetivos Semanales</h3>
        <div className="space-y-3">
          {OBJECTIVES.map((obj) => (
            <button
              key={obj.week}
              onClick={() => toggleCheck(obj.week)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                checked[obj.week]
                  ? "border-success/30 bg-success/5"
                  : obj.week <= currentWeek
                  ? "border-accent/30 bg-accent/5"
                  : "border-border bg-secondary/20"
              )}
            >
              {checked[obj.week] ? (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold">{obj.label}</p>
                <p className="text-xs text-muted-foreground">{obj.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Map readiness */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-4">Estado por Mapa</h3>
        <div className="grid grid-cols-2 gap-3">
          {mapStatus.map((m) => (
            <div key={m.name} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
              <span className="text-xl">{statusEmoji[m.status]}</span>
              <div>
                <p className="font-semibold text-sm">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.count}p · {m.winRate}% WR · {statusLabel[m.status]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
