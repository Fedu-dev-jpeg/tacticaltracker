import { Match, MAPS, TOURNAMENT_DATE } from "@/types/match";
import { getWinRate } from "@/hooks/useMatches";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface TournamentProps {
  matches: Match[];
}

interface DaySchedule {
  day: string;
  map: string;
  ctFocus: string;
  trFocus: string;
  schedule: { time: string; activity: string }[];
}

interface WeekData {
  week: number;
  label: string;
  dateRange: string;
  desc: string;
  ctTheme: string;
  trTheme: string;
  objective: string;
  tools: string;
  days: DaySchedule[];
}

const WEEKS: WeekData[] = [
  {
    week: 1, label: "Sem 1: Fundamentos", dateRange: "31 Mar – 4 Abr",
    desc: "Posiciones, defaults, comunicación básica",
    ctTheme: "Posiciones A/B, Rotaciones", trTheme: "Defaults, 1-2 Execs",
    objective: "Conocer 4 mapas", tools: "Yprac, Demo review",
    days: [
      { day: "LUN 31", map: "NUKE", ctFocus: "Posiciones", trFocus: "Defaults", schedule: [
        { time: "15:00", activity: "MEETING – Táctico CT+TR" }, { time: "15:30", activity: "WARMUP – Aim Botz / DM" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW – Ver demos" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MAR 1", map: "ANCIENT", ctFocus: "Posiciones", trFocus: "Defaults", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MIE 2", map: "ANUBIS", ctFocus: "Posiciones", trFocus: "Defaults", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "JUE 3", map: "INFERNO", ctFocus: "Posiciones", trFocus: "Defaults", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "VIE 4", map: "MIX 4", ctFocus: "Repaso", trFocus: "Errores", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "TREINO 3" }, { time: "18:15", activity: "TREINO 4" },
        { time: "19:00", activity: "REVIEW" }, { time: "19:30", activity: "FIN" },
      ]},
    ],
  },
  {
    week: 2, label: "Sem 2: Economía", dateRange: "7 – 11 Abr",
    desc: "Pistols, forces, anti-ecos",
    ctTheme: "Pistol+Anti-eco", trTheme: "Pistol+Force buys",
    objective: "Dominar economía", tools: "Pistol DM, Retakes",
    days: [
      { day: "LUN 7", map: "NUKE", ctFocus: "Pistol+Anti", trFocus: "Pistol+Force", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MAR 8", map: "ANCIENT", ctFocus: "Pistol+Anti", trFocus: "Pistol+Force", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MIE 9", map: "ANUBIS", ctFocus: "Pistol+Anti", trFocus: "Pistol+Force", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "JUE 10", map: "INFERNO", ctFocus: "Pistol+Anti", trFocus: "Pistol+Force", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "DEBRIEF" }, { time: "17:40", activity: "TREINO 3" },
        { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "VIE 11", map: "MIX 4", ctFocus: "Anti-Eco x4", trFocus: "Forces x4", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO 1" }, { time: "16:45", activity: "TREINO 2" },
        { time: "17:30", activity: "TREINO 3" }, { time: "18:15", activity: "TREINO 4" },
        { time: "19:00", activity: "REVIEW" }, { time: "19:30", activity: "FIN" },
      ]},
    ],
  },
  {
    week: 3, label: "Sem 3: Clutch + Scrims", dateRange: "14 – 18 Abr",
    desc: "Retakes, postplant, clutches",
    ctTheme: "Retakes A/B, Trade", trTheme: "Postplant, Clutch",
    objective: "Situaciones finales", tools: "Scrims, Debrief",
    days: [
      { day: "LUN 14", map: "NUKE", ctFocus: "Retakes", trFocus: "Postplant", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM 1" }, { time: "17:00", activity: "SCRIM 2" },
        { time: "18:00", activity: "DEBRIEF" }, { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MAR 15", map: "ANCIENT", ctFocus: "Retakes", trFocus: "Postplant", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM 1" }, { time: "17:00", activity: "SCRIM 2" },
        { time: "18:00", activity: "DEBRIEF" }, { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MIE 16", map: "ANUBIS", ctFocus: "Retakes", trFocus: "Postplant", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM 1" }, { time: "17:00", activity: "SCRIM 2" },
        { time: "18:00", activity: "DEBRIEF" }, { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "JUE 17", map: "INFERNO", ctFocus: "Retakes", trFocus: "Postplant", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM 1" }, { time: "17:00", activity: "SCRIM 2" },
        { time: "18:00", activity: "DEBRIEF" }, { time: "18:30", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "VIE 18", map: "BO3", ctFocus: "Veto", trFocus: "Comms", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM MAP 1" }, { time: "17:00", activity: "SCRIM MAP 2" },
        { time: "18:00", activity: "SCRIM MAP 3" }, { time: "19:00", activity: "REVIEW" }, { time: "19:45", activity: "FIN" },
      ]},
    ],
  },
  {
    week: 4, label: "Sem 4: Match Week", dateRange: "21 – 25 Abr",
    desc: "Ensayo general, mentalidad competitiva",
    ctTheme: "Ajustes, Counters", trTheme: "Variantes, Adapt",
    objective: "Match ready 25/04", tools: "BO3 simulacro",
    days: [
      { day: "LUN 21", map: "AJUSTES", ctFocus: "Correcciones", trFocus: "Correcciones", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "TREINO – Ajustes finales" }, { time: "17:00", activity: "TREINO – Puntos débiles" },
        { time: "18:00", activity: "REVIEW" }, { time: "19:00", activity: "FIN" },
      ]},
      { day: "MAR 22", map: "BO3 SCRIM", ctFocus: "Veto practice", trFocus: "Veto practice", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "SCRIM MAP 1" }, { time: "17:00", activity: "SCRIM MAP 2" },
        { time: "18:00", activity: "SCRIM MAP 3" }, { time: "19:00", activity: "REVIEW + FIN" },
      ]},
      { day: "MIE 23", map: "LIGHT", ctFocus: "DM Light", trFocus: "Retakes light", schedule: [
        { time: "15:00", activity: "MEETING" }, { time: "15:30", activity: "WARMUP" },
        { time: "16:00", activity: "DM Light" }, { time: "17:00", activity: "Retakes" }, { time: "17:30", activity: "FIN" },
      ]},
      { day: "JUE 24", map: "DESCANSO", ctFocus: "OFF", trFocus: "OFF", schedule: [
        { time: "—", activity: "DÍA OFF – Preparación mental" },
        { time: "—", activity: "Visualización y mentalidad" },
      ]},
      { day: "VIE 25 🏆", map: "TORNEO", ctFocus: "15:00h", trFocus: "VAMOS", schedule: [
        { time: "15:00", activity: "🏆 TORNEO – VAMOS HAMBRIENTOS 🏆" },
      ]},
    ],
  },
];

export default function TournamentProgress({ matches }: TournamentProps) {
  const now = new Date();
  const daysLeft = Math.max(0, differenceInDays(TOURNAMENT_DATE, now));
  const totalDays = 28;
  const trainingStart = new Date(TOURNAMENT_DATE);
  trainingStart.setDate(trainingStart.getDate() - totalDays);
  const daysPassed = Math.max(0, differenceInDays(now, trainingStart));
  const progress = Math.min(100, Math.round((daysPassed / totalDays) * 100));
  const currentWeek = Math.min(4, Math.ceil(daysPassed / 7) || 1);

  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    try { const saved = localStorage.getItem("hambrientos_objectives"); return saved ? JSON.parse(saved) : {}; } catch { return {}; }
  });
  const [expandedWeek, setExpandedWeek] = useState<number | null>(currentWeek);

  const toggleCheck = (week: number) => {
    const next = { ...checked, [week]: !checked[week] };
    setChecked(next);
    localStorage.setItem("hambrientos_objectives", JSON.stringify(next));
  };

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
    <div className="space-y-6 max-w-3xl mx-auto animate-slide-up">
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

      {/* Weekly plan with daily breakdown */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow space-y-3">
        <h3 className="text-lg font-heading font-bold mb-2">Plan de Entrenamiento</h3>

        {WEEKS.map((w) => {
          const isExpanded = expandedWeek === w.week;
          return (
            <div key={w.week} className={cn("rounded-lg border transition-all", checked[w.week] ? "border-success/30 bg-success/5" : w.week <= currentWeek ? "border-accent/30 bg-accent/5" : "border-border bg-secondary/20")}>
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => toggleCheck(w.week)} className="shrink-0">
                  {checked[w.week] ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{w.label}</p>
                  <p className="text-xs text-muted-foreground">{w.dateRange} · {w.desc}</p>
                </div>
                <button onClick={() => setExpandedWeek(isExpanded ? null : w.week)} className="shrink-0 p-1 hover:bg-secondary/50 rounded">
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>

              {/* Expanded: daily schedule */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-3">
                  {/* Summary row */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-primary/10 rounded-md p-2 border border-primary/20">
                      <span className="font-semibold text-primary-foreground">CT:</span> {w.ctTheme}
                    </div>
                    <div className="bg-accent/10 rounded-md p-2 border border-accent/20">
                      <span className="font-semibold text-accent">TR:</span> {w.trTheme}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">🎯 {w.objective} · 🛠️ {w.tools}</div>

                  {/* Daily cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {w.days.map((day) => (
                      <div key={day.day} className="bg-secondary/30 rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-bold text-xs text-accent">{day.day}</span>
                          <span className="text-[10px] bg-secondary rounded px-1.5 py-0.5 text-muted-foreground">{day.map}</span>
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          <span className="text-primary-foreground">CT: {day.ctFocus}</span>
                          <span className="text-accent">TR: {day.trFocus}</span>
                        </div>
                        <div className="space-y-0.5">
                          {day.schedule.map((s, i) => (
                            <div key={i} className="flex gap-2 text-[10px]">
                              <span className="text-muted-foreground w-10 shrink-0 flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />{s.time}
                              </span>
                              <span className={cn("text-foreground/80", s.activity.includes("🏆") && "text-accent font-bold")}>{s.activity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pro methodology notes */}
      <div className="bg-card rounded-lg border border-border p-6 card-glow">
        <h3 className="text-lg font-heading font-bold mb-3">⚠️ Metodología PRO</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li><strong className="text-foreground">MEETING (30 min):</strong> Táctico CT+TR ANTES del warmup. Objetivos claros.</li>
          <li><strong className="text-foreground">WARMUP (30 min):</strong> Aim Botz / DM individual. No saltar directo a treinos.</li>
          <li><strong className="text-foreground">DEBRIEF (10 min):</strong> Entre scrims evaluar errores. No culpar, ENTENDER.</li>
          <li><strong className="text-foreground">REVIEW (30 min):</strong> Ver demos del día. Identificar 2-3 puntos a mejorar.</li>
          <li><strong className="text-foreground">FOCUS &gt; VOLUME:</strong> 3 treinos con foco &gt; 6 sin pensar.</li>
          <li><strong className="text-foreground">HOMEWORK:</strong> Si práctica fue mala, responsables se reúnen después.</li>
        </ul>
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
