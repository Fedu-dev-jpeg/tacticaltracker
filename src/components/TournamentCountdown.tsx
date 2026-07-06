import { useEffect, useState } from "react";
import { Timer, Trophy } from "lucide-react";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { ms, days, hours, minutes, seconds };
}

interface Props {
  target: Date;
  name?: string;
  format?: string;
  onOpenTournaments?: () => void;
}

export default function TournamentCountdown({ target, name, format, onOpenTournaments }: Props) {
  const [t, setT] = useState(() => diff(target));
  useEffect(() => {
    setT(diff(target));
    const id = window.setInterval(() => setT(diff(target)), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  const over = t.ms === 0;
  const cells: { label: string; value: number }[] = [
    { label: "Días", value: t.days },
    { label: "Horas", value: t.hours },
    { label: "Min", value: t.minutes },
    { label: "Seg", value: t.seconds },
  ];

  const dateLabel = target.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative overflow-hidden rounded-lg border border-accent/40 bg-gradient-to-br from-accent/15 via-card to-card p-5 card-glow">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10 blur-2xl" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-4 relative">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg gradient-accent">
            {over ? <Trophy className="h-5 w-5 text-primary-foreground" /> : <Timer className="h-5 w-5 text-primary-foreground" />}
          </div>
          <div>
            <p className="stat-label">
              {over ? "El torneo ya empezó" : "Cuenta regresiva al Torneo"}
            </p>
            <p className="text-sm font-heading font-bold text-accent">
              {name ? `${name} · ` : ""}{dateLabel}{format ? ` · ${format}` : ""}
            </p>
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
      {onOpenTournaments && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onOpenTournaments}
            className="text-xs px-2.5 py-1 rounded-md border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
          >
            Ver en Torneos
          </button>
        </div>
      )}
    </div>
  );
}
