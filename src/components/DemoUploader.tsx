import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileArchive, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "uploading" | "parsing" | "matching" | "done" | "error";

interface ParsedDemo {
  map?: string;
  score_us?: number;
  score_them?: number;
  rival?: string;
  starting_side?: "CT" | "TR";
  players?: Array<{ steam_id: string; steam_tag: string; matched_user_id?: string | null }>;
}

export default function DemoUploader({ onParsed }: { onParsed: (d: ParsedDemo) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParsedDemo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(dem|dem\.bz2)$/i)) {
        toast.error("El archivo debe ser .dem o .dem.bz2");
        return;
      }
      setError(null);
      setResult(null);
      try {
        setStatus("uploading");
        setProgress(`Subiendo ${file.name}...`);
        const path = `${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("demos").upload(path, file, {
          contentType: "application/octet-stream",
        });
        if (upErr) throw new Error("Upload: " + upErr.message);

        setStatus("parsing");
        setProgress("Parseando demo...");
        const { data, error: fnErr } = await supabase.functions.invoke("parse-demo", {
          body: { path },
        });
        if (fnErr) throw new Error("Parser: " + fnErr.message);

        setStatus("matching");
        setProgress("Vinculando jugadores...");
        setResult(data as ParsedDemo);
        onParsed(data as ParsedDemo);
        setStatus("done");
        setProgress("Listo");
        toast.success("Demo procesada");
      } catch (e) {
        setStatus("error");
        setError(String((e as Error).message));
        toast.error("Falló el procesamiento");
      }
    },
    [onParsed]
  );

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-accent" />
          Importar Demo (.dem)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <label
          className={cn(
            "block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            dragOver ? "border-accent bg-accent/10" : "border-border hover:border-accent/50 bg-muted/20"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <input
            type="file"
            accept=".dem,.bz2"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Upload className="h-10 w-10 mx-auto text-accent mb-3" />
          <div className="text-sm font-medium mb-1">Arrastrá el .dem acá</div>
          <div className="text-xs text-muted-foreground mb-4">
            Se autocompletan mapa, score, rounds y stats individuales
          </div>
          <Button type="button" variant="default" size="sm" className="pointer-events-none">
            Seleccionar archivo .dem / .dem.bz2
          </Button>
        </label>

        {status !== "idle" && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            {status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : status === "error" ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            )}
            <span className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
              {error ?? progress}
            </span>
          </div>
        )}

        {result?.players && result.players.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Jugadores detectados
            </div>
            <div className="grid gap-1.5">
              {result.players.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-2"
                >
                  <span className="font-mono">
                    {p.steam_tag}
                    <span className="text-muted-foreground ml-2">{p.steam_id}</span>
                  </span>
                  {p.matched_user_id ? (
                    <span className="text-success text-[10px] uppercase">✓ vinculado</span>
                  ) : (
                    <span className="text-muted-foreground text-[10px] uppercase">sin vincular</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
