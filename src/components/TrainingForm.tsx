import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Match, MAPS, MATCH_TYPES, MapName, MatchType, Side, WinLoss } from "@/types/match";
import { toast } from "sonner";
import DemoUploader from "@/components/DemoUploader";

interface TrainingFormProps {
  onSubmit: (match: Omit<Match, "id">) => void;
  initialData?: Match;
}

function WinLossToggle({ value, onChange, label }: { value: WinLoss; onChange: (v: WinLoss) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange("WIN")}
          className={cn(
            "flex-1 py-2 rounded-md text-xs font-semibold transition-all",
            value === "WIN" ? "bg-success text-success-foreground shadow-md" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
          )}
        >
          WIN
        </button>
        <button
          type="button"
          onClick={() => onChange("LOSS")}
          className={cn(
            "flex-1 py-2 rounded-md text-xs font-semibold transition-all",
            value === "LOSS" ? "bg-destructive text-destructive-foreground shadow-md" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
          )}
        >
          LOSS
        </button>
      </div>
    </div>
  );
}

export default function TrainingForm({ onSubmit, initialData }: TrainingFormProps) {
  const [date, setDate] = useState<Date>(initialData ? new Date(initialData.date) : new Date());
  const [type, setType] = useState<MatchType>(initialData?.type ?? "Treino");
  const [map, setMap] = useState<MapName>(initialData?.map ?? "Nuke");
  const [rival, setRival] = useState(initialData?.rival ?? "");
  const [scoreUs, setScoreUs] = useState(initialData?.scoreUs?.toString() ?? "");
  const [scoreThem, setScoreThem] = useState(initialData?.scoreThem?.toString() ?? "");
  const [ctPistol, setCtPistol] = useState<WinLoss>(initialData?.ctPistol ?? "WIN");
  const [ctSecondRound, setCtSecondRound] = useState<WinLoss>(initialData?.ctSecondRound ?? "WIN");
  const [ctSetup, setCtSetup] = useState<WinLoss>(initialData?.ctSetup ?? "WIN");
  const [ctFinalizacion, setCtFinalizacion] = useState<WinLoss>(initialData?.ctFinalizacion ?? "WIN");
  const [trPistol, setTrPistol] = useState<WinLoss>(initialData?.trPistol ?? "WIN");
  const [trSecondRound, setTrSecondRound] = useState<WinLoss>(initialData?.trSecondRound ?? "WIN");
  const [trSetup, setTrSetup] = useState<WinLoss>(initialData?.trSetup ?? "WIN");
  const [trFinalizacion, setTrFinalizacion] = useState<WinLoss>(initialData?.trFinalizacion ?? "WIN");
  const [startingSide, setStartingSide] = useState<Side>(initialData?.startingSide ?? "CT");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreUs || !scoreThem) {
      toast.error("Completa el score final");
      return;
    }
    onSubmit({
      date: date.toISOString(),
      type,
      map,
      rival,
      scoreUs: parseInt(scoreUs),
      scoreThem: parseInt(scoreThem),
      ctPistol,
      ctSecondRound,
      ctSetup,
      ctFinalizacion,
      trPistol,
      trSecondRound,
      trSetup,
      trFinalizacion,
      startingSide,
      notes,
    });
    toast.success("¡Treino registrado exitosamente!");
    // Reset
    setRival("");
    setScoreUs("");
    setScoreThem("");
    setNotes("");
    setCtPistol("WIN");
    setCtSecondRound("WIN");
    setCtSetup("WIN");
    setCtFinalizacion("WIN");
    setTrPistol("WIN");
    setTrSecondRound("WIN");
    setTrSetup("WIN");
    setTrFinalizacion("WIN");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto animate-slide-up">
      <DemoUploader
        onParsed={(d) => {
          if (d.map && (MAPS as string[]).includes(d.map)) setMap(d.map as MapName);
          if (typeof d.score_us === "number") setScoreUs(String(d.score_us));
          if (typeof d.score_them === "number") setScoreThem(String(d.score_them));
          if (d.rival) setRival(d.rival);
          if (d.starting_side === "CT" || d.starting_side === "TR") setStartingSide(d.starting_side);
        }}
      />
      <div className="bg-card rounded-lg border border-border p-6 card-glow space-y-6">
        <h2 className="text-xl font-heading font-bold flex items-center gap-2">
          <Plus className="h-5 w-5 text-accent" />
          Registrar Treino
        </h2>

        {/* Row 1: Date, Type, Map */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as MatchType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mapa</Label>
            <Select value={map} onValueChange={(v) => setMap(v as MapName)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Rival, Score */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label className="text-xs">Rival / Notas</Label>
            <Input value={rival} onChange={(e) => setRival(e.target.value)} placeholder="Nombre del rival..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Score Nosotros</Label>
            <Input type="number" min={0} max={99} value={scoreUs} onChange={(e) => setScoreUs(e.target.value)} placeholder="13" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Score Rival</Label>
            <Input type="number" min={0} max={99} value={scoreThem} onChange={(e) => setScoreThem(e.target.value)} placeholder="10" />
          </div>
        </div>

        {/* Starting side */}
        <div className="space-y-1.5">
          <Label className="text-xs">Empezamos</Label>
          <div className="flex gap-2">
            {(["CT", "TR"] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStartingSide(s)}
                className={cn(
                  "flex-1 py-2 rounded-md text-sm font-semibold transition-all",
                  startingSide === s
                    ? s === "CT" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* CT Side */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <WinLossToggle value={ctPistol} onChange={setCtPistol} label="CT Pistol" />
          <WinLossToggle value={ctSecondRound} onChange={setCtSecondRound} label="CT 2nd Round" />
          <WinLossToggle value={ctSetup} onChange={setCtSetup} label="CT Setup" />
          <WinLossToggle value={ctFinalizacion} onChange={setCtFinalizacion} label="CT Finalización" />
        </div>
        {/* TR Side */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <WinLossToggle value={trPistol} onChange={setTrPistol} label="TR Pistol" />
          <WinLossToggle value={trSecondRound} onChange={setTrSecondRound} label="TR 2nd Round" />
          <WinLossToggle value={trSetup} onChange={setTrSetup} label="TR Setup" />
          <WinLossToggle value={trFinalizacion} onChange={setTrFinalizacion} label="TR Finalización" />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Notas adicionales</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Errores, cosas a mejorar, estrategias probadas..." rows={3} />
        </div>

        <Button type="submit" className="w-full gradient-accent text-accent-foreground font-heading text-lg h-12">
          Guardar Registro
        </Button>
      </div>
    </form>
  );
}
