import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileArchive, Loader2, CheckCircle2, AlertCircle, Link2, Tag, HelpCircle, Sparkles, BarChart3, CloudUpload, Cpu, Save, UserPlus, XCircle, RotateCcw, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MatchStatsDialog, { DemoData } from "@/components/MatchStatsDialog";
import { useTeamMembers } from "@/hooks/useTeamMembers";

type Stage = "idle" | "uploading" | "parsing" | "matching" | "saving" | "done" | "error" | "cancelled";

const STAGES: { key: Stage; label: string; icon: React.ElementType; pct: number }[] = [
  { key: "uploading", label: "Subiendo demo", icon: CloudUpload, pct: 20 },
  { key: "parsing", label: "Parseando rounds y economía", icon: Cpu, pct: 55 },
  { key: "matching", label: "Vinculando jugadores por SteamID", icon: Link2, pct: 80 },
  { key: "saving", label: "Guardando en base de datos", icon: Save, pct: 95 },
  { key: "done", label: "Import completado", icon: CheckCircle2, pct: 100 },
];

interface ParsedPlayer {
  steam_id: string; steam_tag: string;
  matched_user_id: string | null;
  matched_player_name: string | null;
  match_type: "steam_id" | "steam_tag" | "unmatched";
  avatar_url: string | null;
  kills: number; deaths: number; assists: number;
  adr: number; hs_pct: number; kast_pct: number; rating: number;
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
  demo_data?: DemoData;
}

export default function DemoUploader({ onParsed }: { onParsed: (d: ParsedDemo) => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParsedDemo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({}); // steam_id -> team_member.id
  const [assigning, setAssigning] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [failedStage, setFailedStage] = useState<Stage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { members: teamMembers } = useTeamMembers();
  const players = teamMembers.filter((m) => !m.is_coach);

  const assignManualLink = async (p: ParsedPlayer) => {
    const memberId = manualLinks[p.steam_id];
    if (!memberId || !result?.match_id) {
      toast.error("Elegí un jugador primero");
      return;
    }
    const member = players.find((m) => m.id === memberId);
    if (!member) return;
    setAssigning(p.steam_id);
    // 1) update player_stats row
    const { error: updErr } = await supabase
      .from("player_stats")
      .update({ user_id: member.user_id })
      .eq("match_id", result.match_id)
      .eq("steam_id", p.steam_id);
    if (updErr) {
      setAssigning(null);
      toast.error("No se pudo asignar: " + updErr.message);
      return;
    }
    // 2) opportunistically patch team_member for future auto-linking
    const patch: { steam_id?: string; steam_tag?: string } = {};
    const looksLikeSteamId = /^7656119\d{10}$/.test(p.steam_id);
    if (looksLikeSteamId && !member.steam_id) patch.steam_id = p.steam_id;
    if (p.steam_tag && !member.steam_tag) patch.steam_tag = p.steam_tag;
    if (Object.keys(patch).length > 0) {
      await supabase.from("team_members").update(patch).eq("id", memberId);
    }
    // 3) update local result to reflect the link
    setResult((prev) => {
      if (!prev?.players) return prev;
      return {
        ...prev,
        players: prev.players.map((row) =>
          row.steam_id === p.steam_id
            ? {
                ...row,
                match_type: looksLikeSteamId ? "steam_id" : "steam_tag",
                matched_user_id: member.user_id,
                matched_player_name: member.player_name,
                avatar_url: (member as { steam_avatar_url?: string | null }).steam_avatar_url ?? row.avatar_url,
              }
            : row,
        ),
        summary: prev.summary
          ? { ...prev.summary, unmatched: Math.max(0, prev.summary.unmatched - 1), by_steam_tag: prev.summary.by_steam_tag + 1 }
          : prev.summary,
      };
    });
    setAssigning(null);
    toast.success(`Vinculado a ${member.player_name}`);
  };

  const currentPct = STAGES.find((s) => s.key === stage)?.pct ?? 0;

  const runPipeline = useCallback(
    async (file: File) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setFailedStage(null);
      setResult(null);
      setFileName(file.name);
      const throwIfAborted = () => {
        if (controller.signal.aborted) throw new DOMException("Cancelado por el usuario", "AbortError");
      };
      let current: Stage = "uploading";
      try {
        current = "uploading";
        setStage(current);
        const path = `${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("demos").upload(path, file, {
          contentType: "application/octet-stream",
        });
        throwIfAborted();
        if (upErr) throw new Error("Upload: " + upErr.message);

        current = "parsing";
        setStage(current);
        await new Promise((r) => setTimeout(r, 400));
        throwIfAborted();
        const { data, error: fnErr } = await supabase.functions.invoke("parse-demo", { body: { path } });
        throwIfAborted();
        if (fnErr) throw new Error("Parser: " + fnErr.message);

        current = "matching";
        setStage(current);
        await new Promise((r) => setTimeout(r, 300));
        throwIfAborted();

        current = "saving";
        setStage(current);
        await new Promise((r) => setTimeout(r, 250));
        throwIfAborted();

        setResult(data as ParsedDemo);
        onParsed(data as ParsedDemo);
        setStage("done");
        toast.success("Demo importada correctamente");
      } catch (e) {
        const err = e as Error;
        if (err.name === "AbortError") {
          setStage("cancelled");
          setFailedStage(current);
          toast.info("Subida cancelada");
        } else {
          setStage("error");
          setFailedStage(current);
          setError(String(err.message));
          toast.error("Falló el procesamiento");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [onParsed],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(dem|dem\.bz2|bz2)$/i)) {
        toast.error("El archivo debe ser .dem o .dem.bz2");
        return;
      }
      setLastFile(file);
      await runPipeline(file);
    },
    [runPipeline],
  );

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryUpload = useCallback(() => {
    if (!lastFile) return;
    runPipeline(lastFile);
  }, [lastFile, runPipeline]);

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-accent" />
          Importar Demo (.dem)
          {result?.demo_data && (
            <div className="ml-auto">
              <MatchStatsDialog data={result.demo_data} />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <label
            className={cn(
              "flex-1 block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
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

          {result?.demo_data && (
            <MatchStatsDialog
              data={result.demo_data}
              trigger={
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-2 w-32 rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors p-4"
                >
                  <BarChart3 className="h-6 w-6 text-accent" />
                  <div className="text-xs font-heading font-bold text-accent">Stats</div>
                  <div className="text-[10px] text-muted-foreground text-center">Ver estadísticas de la demo</div>
                </button>
              }
            />
          )}
        </div>

        {/* Progress area */}
        {stage !== "idle" && (
          <div className="rounded-md border border-border bg-card/40 p-3 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {stage === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : stage === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                )}
                <span className={cn(stage === "error" && "text-destructive", stage === "done" && "text-success")}>
                  {stage === "error" ? error : STAGES.find((s) => s.key === stage)?.label}
                </span>
              </div>
              {fileName && <span className="text-muted-foreground text-[10px] truncate max-w-[200px]">{fileName}</span>}
            </div>
            <Progress value={stage === "error" ? 0 : currentPct} className="h-1.5" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {STAGES.map((s) => {
                const active = stageActive(s.key);
                const isCurrent = stage === s.key;
                const Icon = s.icon;
                return (
                  <div
                    key={s.key}
                    className={cn(
                      "flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded border transition-colors",
                      active ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-muted/20 text-muted-foreground",
                      isCurrent && stage !== "done" && "animate-pulse",
                    )}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </div>
                );
              })}
            </div>
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
                  La lógica de vinculación por SteamID64 y tag, la persistencia y el análisis de rounds/economía ya son reales.
                </div>
              </div>
            )}

            <div className="rounded-md border border-border bg-card/50 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <MetaCell label="Mapa" value={result.map ?? "—"} />
              <MetaCell label="Rival" value={result.rival ?? "—"} />
              <MetaCell label="Score" value={`${result.score_us ?? "-"} - ${result.score_them ?? "-"}`} />
              <MetaCell label="Side" value={result.starting_side ?? "—"} />
              <MetaCell label="Rounds" value={String(result.total_rounds ?? 0)} />
            </div>

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
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <div className="h-7 w-7 rounded-full border border-destructive/40 flex items-center justify-center">
                                    <HelpCircle className="h-3.5 w-3.5 text-destructive" />
                                  </div>
                                  <span className="text-destructive text-[11px] uppercase">Sin vincular — asignar manual</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Select
                                    value={manualLinks[p.steam_id] ?? ""}
                                    onValueChange={(v) => setManualLinks((prev) => ({ ...prev, [p.steam_id]: v }))}
                                  >
                                    <SelectTrigger className="h-7 text-[11px] w-36">
                                      <SelectValue placeholder="Elegir jugador" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {players.map((m) => (
                                        <SelectItem key={m.id} value={m.id} className="text-xs">
                                          {m.player_name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={!manualLinks[p.steam_id] || assigning === p.steam_id}
                                    onClick={() => assignManualLink(p)}
                                  >
                                    {assigning === p.steam_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><UserPlus className="h-3 w-3 mr-1" /> Vincular</>}
                                  </Button>
                                </div>
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
