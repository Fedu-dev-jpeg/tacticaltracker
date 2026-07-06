import { Card, CardContent } from "@/components/ui/card";
import { Trophy, CalendarClock } from "lucide-react";
import TournamentsManager from "@/components/TournamentsManager";
import { useTournaments, getUpcomingTournament } from "@/hooks/useTournaments";
import TournamentCountdown from "@/components/TournamentCountdown";

export default function Torneos() {
  const { tournaments } = useTournaments();
  const upcoming = getUpcomingTournament(tournaments);
  const upcomingDate = upcoming ? new Date(upcoming.start_date) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
          <Trophy className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-heading">Torneos</h1>
          <p className="text-sm text-muted-foreground">Preparación y historial de competencias.</p>
        </div>
      </div>

      {upcoming && upcomingDate && (
        <TournamentCountdown target={upcomingDate} name={upcoming.name} format={upcoming.format} />
      )}

      <TournamentsManager />

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-sm font-heading font-bold mb-2">
            <CalendarClock className="h-4 w-4 text-accent" />
            Flujo recomendado
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>Agendá torneo con fecha, formato y notas de preparación.</li>
            <li>Sincronizalo a Teamup para que todo el staff vea el evento.</li>
            <li>Usá el detalle para llevar foco de mapas y objetivos semanales.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
