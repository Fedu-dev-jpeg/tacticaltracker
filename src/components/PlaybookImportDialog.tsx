import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MAPS, MapName } from "@/types/match";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileUp, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";

interface ImportResult {
  imported: number;
  map: string;
  strategies: Array<{ name: string; type: string; side: string; warnings: string[] }>;
}

const FORMAT_EXAMPLE = `== Exec :: A-Split Fast
Lado: TR
Descripción: Split rápido con 3 A / 2 apps, molly heaven, flash sobre ninja.
Roles:
- Fedu: IGL, lanza flash desde apps
- Kud: entry por rampa
- Koda: molly heaven
- Ray: humo CT
- Boke: lurk B para hold rotación
Notas: Timing 0:30. Si escuchan drop en apps, cambian a B.
Link: https://youtu.be/xyz
---
== Retake :: Retake B desde CT
Lado: CT
Descripción: Retake coordinado con 2 flashes desde CT y 1 desde tuneles.
Roles:
- Fedu: call de contact
- Kud: entry con AWP peek
Notas: Prioridad matar planter
`;

export default function PlaybookImportDialog({
  book,
  onImported,
}: {
  book: "estrategias" | "individual" | "protocolos" | "setups";
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState<MapName>("Nuke");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runImport = useCallback(async (payload: { pdf_base64?: string; raw_text?: string }) => {
    const { data, error: fnErr } = await supabase.functions.invoke("import-playbook-pdf", {
      body: { ...payload, map, book },
    });
    if (fnErr) throw new Error(fnErr.message);
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    setResult(data as ImportResult);
    toast.success(`Importadas ${(data as ImportResult).imported} estrategias en ${map}`);
    onImported();
  }, [map, book, onImported]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("El archivo debe ser .pdf");
        return;
      }
      setError(null);
      setResult(null);
      setLoading(true);
      try {
        // Read as base64
        const buf = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        const base64 = btoa(binary);
        await runImport({ pdf_base64: base64 });
      } catch (e) {
        setError(String((e as Error).message));
        toast.error("No se pudo importar el PDF");
      } finally {
        setLoading(false);
      }
    },
    [runImport],
  );

  const handleTextImport = useCallback(async () => {
    const text = rawText.trim();
    if (!text) {
      toast.error("Pegá el texto del playbook antes de importar");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      await runImport({ raw_text: text });
    } catch (e) {
      setError(String((e as Error).message));
      toast.error("No se pudo importar el texto");
    } finally {
      setLoading(false);
    }
  }, [rawText, runImport]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileUp className="h-3.5 w-3.5" /> Importar PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-accent" /> Importar Playbook desde PDF
          </DialogTitle>
          <DialogDescription>
            Subí un PDF o pegá texto con el formato táctico. Se cargan en el mapa elegido y el lado (CT/TR) se detecta automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Mapa destino</Label>
              <Select value={map} onValueChange={(v) => setMap(v as MapName)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Format spec */}
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-bold uppercase tracking-wider text-accent">Formato esperado</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[10px]"
                onClick={() => { navigator.clipboard.writeText(FORMAT_EXAMPLE); toast.success("Ejemplo copiado"); }}
              >
                <Copy className="h-3 w-3" /> Copiar ejemplo
              </Button>
            </div>
            <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
              <li>Cada estrategia empieza con <code className="text-accent">== TIPO :: NOMBRE</code></li>
              <li>Campos: <code>Lado:</code>, <code>Descripción:</code>, <code>Roles:</code>, <code>Notas:</code>, <code>Link:</code></li>
              <li>Roles en formato <code>- Jugador: rol</code> (Fedu, Kud, Koda, Ray, Boke)</li>
              <li>Separá cada estrategia con una línea de <code>---</code></li>
              <li>Tipos válidos: Pistol, Anti-Eco, Forzado, Default, Exec, Setup, Dominio, Retake, Postplant, Finalización, Calls de base, Sorpresa</li>
            </ul>
            <pre className="text-[10px] bg-background/60 border border-border rounded p-2 overflow-x-auto whitespace-pre leading-tight">
{FORMAT_EXAMPLE}
            </pre>
          </div>

          {/* Upload */}
          <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent/50 transition-colors">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-accent" /> Parseando PDF y creando estrategias...
              </div>
            ) : (
              <>
                <FileUp className="h-8 w-8 mx-auto text-accent mb-2" />
                <div className="text-sm font-medium">Seleccioná el PDF</div>
                <div className="text-xs text-muted-foreground">Se importará al mapa {map}</div>
              </>
            )}
          </label>

          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <Label className="text-xs">O pegar texto directamente</Label>
            <textarea
              className="min-h-[180px] w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
              placeholder="Pegá acá el playbook completo (con títulos, lados, roles, notas, links...)"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={loading}
            />
            <Button variant="outline" className="w-full" onClick={handleTextImport} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
              Importar texto en {map}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-md border border-success/30 bg-success/10 p-3">
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span>{result.imported} estrategias importadas en {result.map}</span>
              </div>
              <div className="space-y-1">
                {result.strategies.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">{s.type}</Badge>
                    <Badge className="text-[10px] bg-accent/20 text-accent border-accent/30">{s.side}</Badge>
                    <span className="font-medium">{s.name}</span>
                    {s.warnings.length > 0 && (
                      <span className="text-[10px] text-yellow-500">⚠ {s.warnings.join("; ")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
