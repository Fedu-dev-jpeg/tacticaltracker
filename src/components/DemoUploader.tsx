import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, FileArchive, Loader2, CheckCircle2, AlertCircle, Link2, Tag, HelpCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "uploading" | "parsing" | "matching" | "done" | "error";

interface ParsedPlayer {
  steam_id: string;
  steam_tag: string;
  matched_user_id: string | null;
  matched_player_name: string | null;
  match_type: "steam_id" | "steam_tag" | "unmatched";
  avatar_url: string | null;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hs_pct: number;
  kast_pct: number;
  rating: number;
}

interface ParsedDemo {
  status?: string;
  simulated?: boolean;
  match_id?: string;
  map?: string;
  score_us?: number;
  score_them?: number;
  rival?: string;
  starting_side?: "CT" | "TR";
  total_rounds?: number;
  players?: ParsedPlayer[];
  summary?: { total: number; by_steam_id: number; by_steam_tag: number; unmatched: number };
}

export default function DemoUploader({ onParsed }: { onParsed: (d: ParsedDemo) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParsedDemo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(dem|dem\.bz2|bz2)$/i)) {
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
        setProgress("Parseando demo y extrayendo stats...");
        const { data, error: fnErr } = await supabase.functions.invoke("parse-demo", { body: { path } });
        if (fnErr) throw new Error("Parser: " + fnErr.message);

        setStatus("matching");
        setProgress("Vinculando jugadores por SteamID...");
        setResult(data as ParsedDemo);
        onParsed(data as ParsedDemo);
        setStatus("done");
        setProgress("Import completado");
        toast.success("Demo importada correctamente");
      } catch (e) {
        setStatus("error");
        setError(String((e as Error).message));
        toast.error("Falló el procesamiento");
      }
    },
    [onParsed],
  );

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-accent" />
          Importar Demo (.dem)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className={cn(
            "block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            dragOver ? "border-accent bg-accent/10" : "border-border hover:border-accent/50 bg-muted/20",
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
            Vinculación automática por <span className="text-accent">SteamID64</span> · fallback por steam tag
          </div>
          <Button type="button" variant="default" size="sm" className="pointer-events-none">
            Seleccionar archivo .dem / .dem.bz2
          </Button>
        </label>

        {status !== "idle" && status !== "done" && (
          <div className="flex items-center gap-2 text-sm">
            {status === "error" ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            )}
            <span className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
              {error ?? progress}
            </span>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.simulated && (
              <div className="flex items-start gap-2 text-xs bg-accent/10 border border-accent/30 rounded-md p-3">
                <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <div className="text-muted-foreground">
                  <span className="text-foreground font-medium">Parser en modo simulado.</span> Los datos se
                  generan a partir del archivo hasta que se conecte el parser real de <code>.dem</code>.
                  La lógica de vinculación por SteamID64 y tag ya es real.
                </div>
              </div>
            )}

            {/* Match header */}
            <div className="rounded-md border border-border bg-card/50 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <MetaCell label="Mapa" value={result.map ?? "—"} />
              <MetaCell label="Rival" value={result.rival ?? "—"} />
              <MetaCell label="Score" value={`${result.score_us ?? "-"} - ${result.score_them ?? "-"}`} />
              <MetaCell label="Side" value={result.starting_side ?? "—"} />
              <MetaCell label="Rounds" value={String(result.total_rounds ?? 0)} />
            </div>

            {/* Match summary */}
            {result.summary && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge className="bg-success/20 text-success border-success/30">
                  <Link2 className="h-3 w-3 mr-1" /> {result.summary.by_steam_id} por SteamID
                </Badge>
                <Badge className="bg-accent/20 text-accent border-accent/30">
                  <Tag className="h-3 w-3 mr-1" /> {result.summary.by_steam_tag} por tag
                </Badge>
                {result.summary.unmatched > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    <HelpCircle className="h-3 w-3 mr-1" /> {result.summary.unmatched} sin vincular
                  </Badge>
                )}
                <Badge variant="outline">Total: {result.summary.total}</Badge>
              </div>
            )}

            {/* Per-player stat rows */}
            {result.players && result.players.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Stats importadas y vinculación
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left">Jugador demo</th>
                        <th className="px-3 py-2 text-left">Vinculado a</th>
                        <th className="px-2 py-2 text-right">K</th>
                        <th className="px-2 py-2 text-right">D</th>
                        <th className="px-2 py-2 text-right">A</th>
                        <th className="px-2 py-2 text-right">ADR</th>
                        <th className="px-2 py-2 text-right">HS%</th>
                        <th className="px-2 py-2 text-right">KAST</th>
                        <th className="px-2 py-2 text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.players.map((p, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.steam_tag}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{p.steam_id}</div>
                          </td>
                          <td className="px-3 py-2">
                            {p.matched_player_name ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7 border border-accent/30">
                                  <AvatarImage src={p.avatar_url ?? undefined} />
                                  <AvatarFallback className="text-[10px] bg-accent/20 text-accent">
                                    {p.matched_player_name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{p.matched_player_name}</div>
                                  <MatchTypeBadge type={p.match_type} />
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="h-7 w-7 rounded-full border border-destructive/40 flex items-center justify-center">
                                  <HelpCircle className="h-3.5 w-3.5 text-destructive" />
                                </div>
                                <span className="text-destructive text-[11px] uppercase">Sin vincular</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono">{p.kills}</td>
                          <td className="px-2 py-2 text-right font-mono">{p.deaths}</td>
                          <td className="px-2 py-2 text-right font-mono">{p.assists}</td>
                          <td className="px-2 py-2 text-right font-mono">{p.adr}</td>
                          <td className="px-2 py-2 text-right font-mono">{p.hs_pct}%</td>
                          <td className="px-2 py-2 text-right font-mono">{p.kast_pct}%</td>
                          <td className="px-2 py-2 text-right font-mono text-accent">{p.rating}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>Import completado y guardado en la base.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-heading text-sm">{value}</div>
    </div>
  );
}

function MatchTypeBadge({ type }: { type: "steam_id" | "steam_tag" | "unmatched" }) {
  if (type === "steam_id")
    return (
      <Badge className="bg-success/20 text-success border-success/30 text-[9px] h-4 px-1.5 mt-0.5">
        <Link2 className="h-2.5 w-2.5 mr-1" /> STEAMID
      </Badge>
    );
  if (type === "steam_tag")
    return (
      <Badge className="bg-accent/20 text-accent border-accent/30 text-[9px] h-4 px-1.5 mt-0.5">
        <Tag className="h-2.5 w-2.5 mr-1" /> TAG
      </Badge>
    );
  return null;
}
