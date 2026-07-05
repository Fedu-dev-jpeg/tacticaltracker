import { Card, CardContent } from "@/components/ui/card";
import { Award, Construction } from "lucide-react";

export default function Awards() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
          <Award className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-heading">Awards</h1>
          <p className="text-sm text-muted-foreground">Premios calculados a partir de las stats de las demos.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <Construction className="h-10 w-10 mx-auto text-accent mb-3" />
          <div className="text-lg font-heading mb-1">Sin datos suficientes</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            MVP, Clutch King, Entry King, HS King y más aparecerán acá una vez que se suban demos con stats por jugador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
