import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileArchive, Loader2, CheckCircle2, AlertCircle, Link2, Tag, HelpCircle, Sparkles, BarChart3, CloudUpload, Cpu, Save, UserPlus, XCircle, RotateCcw, Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MatchStatsDialog, { DemoData } from "@/components/MatchStatsDialog";
import { useTeamMembers } from "@/hooks/useTeamMembers";

type Stage = "uploading" | "parsing" | "matching" | "saving" | "done" | "error" | "cancelled";

const STAGES: { key: Exclude<Stage, "error" | "cancelled">; label: string; icon: React.ElementType; pct: number }[] = [
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

interface Job {
  id: string;
  fileName: string;
  file: File;
  stage: Stage;
  failedStage: Stage | null;
  error: string | null;
  result: ParsedDemo | null;
  abort: AbortController;
}

export default function DemoUploader({ onParsed }: { onParsed: (d: ParsedDemo) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [result, setResult] = useState<ParsedDemo | null>(null);
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({}); // steam_id -> team_member.id
  const [assigning, setAssigning] = useState<string | null>(null);
  const { members: teamMembers } = useTeamMembers();
  const players = teamMembers.filter((m) => !m.is_coach);

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const assignManualLink = async (p: ParsedPlayer) => {
    const memberId = manualLinks[p.steam_id];
    if (!memberId || !result?.match_id) {
      toast.error("Elegí un jugador primero");
      return;
    }
    const member = players.find((m) => m.id === memberId);
    if (!member) return;
    setAssigning(p.steam_id);
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
    const patch: { steam_id?: string; steam_tag?: string } = {};
    const looksLikeSteamId = /^7656119\d{10}$/.test(p.steam_id);
    if (looksLikeSteamId && !member.steam_id) patch.steam_id = p.steam_id;
    if (p.steam_tag && !member.steam_tag) patch.steam_tag = p.steam_tag;
    if (Object.keys(patch).length > 0) {
      await supabase.from("team_members").update(patch).eq("id", memberId);
    }
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

  const runPipeline = useCallback(
    async (job: Job) => {
      const throwIfAborted = () => {
        if (job.abort.signal.aborted) throw new DOMException("Cancelado por el usuario", "AbortError");
      };
      let current: Stage = "uploading";
      try {
        current = "uploading";
        updateJob(job.id, { stage: current });
        const path = `${Date.now()}-${job.file.name}`;
        const { error: upErr } = await supabase.storage.from("demos").upload(path, job.file, {
          contentType: "application/octet-stream",
        });
        throwIfAborted();
        if (upErr) throw new Error("Upload: " + upErr.message);

        current = "parsing";
        updateJob(job.id, { stage: current });
        await new Promise((r) => setTimeout(r, 400));
        throwIfAborted();
        const { data, error: fnErr } = await supabase.functions.invoke("parse-demo", { body: { path } });
        throwIfAborted();
        if (fnErr) throw new Error("Parser: " + fnErr.message);

        current = "matching";
        updateJob(job.id, { stage: current });
        await new Promise((r) => setTimeout(r, 300));
        throwIfAborted();

        current = "saving";
        updateJob(job.id, { stage: current });
        await new Promise((r) => setTimeout(r, 250));
        throwIfAborted();

        const parsed = data as ParsedDemo;
        updateJob(job.id, { stage: "done", result: parsed });
        setResult(parsed);
        onParsed(parsed);
        toast.success(`Demo importada: ${job.fileName}`);
      } catch (e) {
        const err = e as Error;
        if (err.name === "AbortError") {
          updateJob(job.id, { stage: "cancelled", failedStage: current });
          toast.info(`Cancelada: ${job.fileName}`);
        } else {
          updateJob(job.id, { stage: "error", failedStage: current, error: String(err.message) });
          toast.error(`Falló ${job.fileName}`);
        }
      }
    },
    [onParsed, updateJob],
  );

  const startJobs = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      for (const f of files) {
        if (!f.name.match(/\.(dem|dem\.bz2|bz2)$/i)) {
          toast.error(`Ignorado: ${f.name} (no es .dem)`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      const newJobs: Job[] = valid.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        fileName: f.name,
        file: f,
        stage: "uploading",
        failedStage: null,
        error: null,
        result: null,
        abort: new AbortController(),
      }));
      setJobs((prev) => [...prev, ...newJobs]);
      // fire in parallel
      newJobs.forEach((j) => runPipeline(j));
    },
    [runPipeline],
  );

  const cancelJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id);
      j?.abort.abort();
      return prev;
    });
  }, []);

  const retryJob = useCallback(
    (id: string) => {
      setJobs((prev) => {
        const j = prev.find((x) => x.id === id);
        if (!j) return prev;
        const fresh: Job = { ...j, stage: "uploading", failedStage: null, error: null, result: null, abort: new AbortController() };
        // run outside of setState
        queueMicrotask(() => runPipeline(fresh));
        return prev.map((x) => (x.id === id ? fresh : x));
      });
    },
    [runPipeline],
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id);
      if (j && (j.stage === "uploading" || j.stage === "parsing" || j.stage === "matching" || j.stage === "saving")) {
        j.abort.abort();
      }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.stage !== "done" && j.stage !== "error" && j.stage !== "cancelled"));
  }, []);

  const activeCount = jobs.filter((j) => ["uploading", "parsing", "matching", "saving"].includes(j.stage)).length;
  const finishedCount = jobs.filter((j) => ["done", "error", "cancelled"].includes(j.stage)).length;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileArchive className="h-4 w-4 text-accent" />
          Importar Demos (.dem)
          {activeCount > 0 && (
            <Badge className="bg-accent/20 text-accent border-accent/30 ml-2">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> {activeCount} en curso
            </Badge>
          )}
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
              const fs = Array.from(e.dataTransfer.files ?? []);
              if (fs.length) startJobs(fs);
            }}
          >
            <input
              type="file"
              accept=".dem,.bz2"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) startJobs(fs);
                e.currentTarget.value = "";
              }}
            />
            <Upload className="h-10 w-10 mx-auto text-accent mb-3" />
            <div className="text-sm font-medium mb-1">Arrastrá una o varias .dem acá</div>
            <div className="text-xs text-muted-foreground mb-4">
              Se procesan en paralelo · vinculación por <span className="text-accent">SteamID64</span> · fallback por tag
            </div>
            <Button type="button" variant="default" size="sm" className="pointer-events-none">
              Seleccionar archivos .dem / .dem.bz2
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
                  <div className="text-[10px] text-muted-foreground text-center">Última demo importada</div>
                </button>
              }
            />
          )}
        </div>

        {/* Jobs list */}
        {jobs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-widest">
              <span>Cola de importación · {jobs.length}</span>
              {finishedCount > 0 && (
                <button onClick={clearCompleted} className="normal-case tracking-normal hover:text-destructive flex items-center gap-1">
                  <Trash2 className="h-3 w-3" /> Limpiar completadas
                </button>
              )}
            </div>
            {jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onCancel={() => cancelJob(j.id)}
                onRetry={() => retryJob(j.id)}
                onRemove={() => removeJob(j.id)}
                onOpen={() => j.result && setResult(j.result)}
                isSelected={result?.match_id === j.result?.match_id && !!j.result?.match_id}
              />
            ))}
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

function JobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
  onOpen,
  isSelected,
}: {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onOpen: () => void;
  isSelected: boolean;
}) {
  const active = job.stage === "uploading" || job.stage === "parsing" || job.stage === "matching" || job.stage === "saving";
  const currentPct = STAGES.find((s) => s.key === (job.stage === "error" || job.stage === "cancelled" ? job.failedStage : job.stage))?.pct ?? 0;

  return (
    <div className={cn(
      "rounded-md border p-3 space-y-2 transition-colors",
      isSelected ? "border-accent/60 bg-accent/5" : "border-border bg-card/40",
    )}>
      <div className="flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {job.stage === "error" ? (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : job.stage === "cancelled" ? (
            <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : job.stage === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />
          )}
          <span className="truncate font-medium">{job.fileName}</span>
          <span className={cn(
            "truncate text-muted-foreground text-[10px] hidden sm:inline",
            job.stage === "error" && "text-destructive",
            job.stage === "done" && "text-success",
          )}>
            {job.stage === "error"
              ? `Falló en "${STAGES.find((s) => s.key === job.failedStage)?.label ?? "el proceso"}": ${job.error}`
              : job.stage === "cancelled"
                ? `Cancelado en "${STAGES.find((s) => s.key === job.failedStage)?.label ?? "el proceso"}"`
                : STAGES.find((s) => s.key === job.stage)?.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {job.stage === "done" && job.result?.demo_data && (
            <MatchStatsDialog
              data={job.result.demo_data}
              trigger={
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-accent/40 text-accent hover:bg-accent/10">
                  <BarChart3 className="h-3 w-3 mr-1" /> Stats
                </Button>
              }
            />
          )}
          {job.stage === "done" && !isSelected && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onOpen}>
              Ver detalles
            </Button>
          )}
          {active && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onCancel}>
              <Ban className="h-3 w-3 mr-1" /> Cancelar
            </Button>
          )}
          {(job.stage === "error" || job.stage === "cancelled") && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-accent/40 text-accent hover:bg-accent/10" onClick={onRetry}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reintentar
            </Button>
          )}
          {!active && (
            <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" title="Quitar de la lista">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <Progress value={currentPct} className="h-1.5" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {STAGES.map((s) => {
          const order = STAGES.map((x) => x.key);
          const stageIdx = order.indexOf(job.stage as typeof s.key);
          const sIdx = order.indexOf(s.key);
          const done = job.stage === "done" ? true : sIdx < stageIdx;
          const isCurrent = job.stage === s.key;
          const isFailed = (job.stage === "error" || job.stage === "cancelled") && job.failedStage === s.key;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={cn(
                "flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded border transition-colors",
                isFailed
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : done
                    ? "border-success/40 bg-success/10 text-success"
                    : isCurrent
                      ? "border-accent/50 bg-accent/10 text-accent animate-pulse"
                      : "border-border bg-muted/20 text-muted-foreground",
              )}
            >
              {isFailed ? (
                <XCircle className="h-3 w-3 shrink-0" />
              ) : done ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Icon className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
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
