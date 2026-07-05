import { useEffect, useState } from "react";
import { TOURNAMENT_DATE } from "@/types/match";
import { Timer, Trophy } from "lucide-react";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { ms, days, hours, minutes, seconds };
}

export default function TournamentCountdown() {
  const [t, setT] = useState(() => diff(TOURNAMENT_DATE));
  useEffect(() => {
    const id = window.setInterval(() => setT(diff(TOURNAMENT_DATE)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const over = t.ms === 0;
  const cells: { label: string; value: number }[] = [
    { label: "Días", value: t.days },
    { label: "Horas", value: t.hours },
    { label: "Min", value: t.minutes },
    { label: "Seg", value: t.seconds },
  ];

  return (
    <div className="relative overflow-hidden rounded-lg border border-accent/40 bg-gradient-to-br from-accent/15 via-card to-card p-5 card-glow">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10 blur-2xl" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-4 relative">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg gradient-accent">
            {over ? <Trophy className="h-5 w-5 text-primary-foreground" /> : <Timer className="h-5 w-5 text-primary-foreground" />}
          </div>
          <div>
            <p className="stat-label">{over ? "El torneo ya empezó" : "Cuenta regresiva al Torneo"}</p>
            <p className="text-sm font-heading font-bold text-accent">25/04/2026 · 15:00</p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          {cells.map((c) => (
            <div
              key={c.label}
              className="min-w-[62px] px-3 py-2 rounded-md bg-card/70 border border-border text-center"
            >
              <div className="font-heading font-bold text-2xl leading-none tabular-nums text-foreground">
                {String(c.value).padStart(2, "0")}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
