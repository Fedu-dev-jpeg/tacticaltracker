import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Construction } from "lucide-react";

export default function Torneos() {
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

      <Card>
        <CardContent className="p-12 text-center">
          <Construction className="h-10 w-10 mx-auto text-accent mb-3" />
          <div className="text-lg font-heading mb-1">Próximamente</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            La sección de torneos permitirá agendar competencias, seguir el estado por mapa, y ver histórico de
            resultados. Estructura de datos ya lista.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
