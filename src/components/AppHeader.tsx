import { SidebarTrigger } from "@/components/ui/sidebar";
import { useMatches } from "@/hooks/useMatches";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const CRUMB: Record<string, string> = {
  "/": "Dashboard",
  "/registrar": "Registrar",
  "/stats": "Stats",
  "/historial": "Historial",
  "/torneos": "Torneos",
  "/agenda": "Agenda",
  "/playbook": "Playbook",
  "/awards": "Awards",
  "/mapas": "Mapas",
  "/equipo": "Equipo",
};

export function AppHeader() {
  const { matches } = useMatches();
  const { pathname } = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const wins = matches.filter((m) => m.scoreUs > m.scoreThem).length;
  const draws = matches.filter((m) => m.scoreUs === m.scoreThem).length;
  const losses = matches.filter((m) => m.scoreUs < m.scoreThem).length;
  const total = matches.length || 1;
  const wr = Math.round((wins / total) * 100);

  const section = CRUMB[pathname] ?? CRUMB[Object.keys(CRUMB).find((k) => k !== "/" && pathname.startsWith(k)) ?? "/"] ?? "";

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center gap-4 px-4 border-b border-border bg-card/70 backdrop-blur-md">
      <SidebarTrigger />
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        <span className="text-accent">TacticalTracker</span>
        <span className="mx-2">/</span>
        <span className="text-foreground">{section}</span>
      </div>
      <div className="ml-auto flex items-center gap-6 text-xs">
        <Stat label="WIN" value={wins} color="text-success" />
        <Stat label="DRW" value={draws} color="text-muted-foreground" />
        <Stat label="LOSS" value={losses} color="text-destructive" />
        <Stat label="WR%" value={`${wr}%`} color="text-accent" />
        <div className="text-muted-foreground font-mono hidden sm:block">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={`font-heading font-bold text-sm ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}
