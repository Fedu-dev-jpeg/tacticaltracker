import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Upload, FileArchive, Loader2, CheckCircle2, AlertCircle, Link2, Tag, HelpCircle, Sparkles, BarChart3, CloudUpload, Cpu, Save, UserPlus, XCircle, RotateCcw, Ban, Trash2, Clock, Gauge, Repeat, Pause, Play, Copy, Timer, Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import MatchStatsDialog, { DemoData } from "@/components/MatchStatsDialog";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useLocalStorage } from "@/hooks/useLocalStorage";

type Stage = "queued" | "uploading" | "parsing" | "matching" | "saving" | "done" | "error" | "cancelled";

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
  file: File | null;
  stage: Stage;
  failedStage: Stage | null;
  error: string | null;
  result: ParsedDemo | null;
  abort: AbortController;
  attempt: number; // 1-indexed current attempt
  maxAttempts: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
}

const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 6] as const;
const RETRY_ATTEMPT_OPTIONS = [2, 3, 4, 5] as const;
const RETRIABLE_STAGES: Stage[] = ["parsing", "matching"];
const STAGE_LABELS: Record<Stage, string> = {
  queued: "En cola",
  uploading: "Subiendo",
  parsing: "Parseando",
  matching: "Vinculando",
  saving: "Guardando",
  done: "Completado",
  error: "Error",
  cancelled: "Cancelado",
};
const JOBS_STORAGE_KEY = "demo-uploader:jobs";

type StatusFilter = "all" | "queued" | "active" | "done" | "error" | "cancelled";
type AttemptFilter = "all" | "first" | "retried";

function serializeJobs(jobs: Job[]) {
  return jobs.map((j) => ({
    id: j.id,
    fileName: j.fileName,
    // Active/queued jobs can't survive a reload (File is gone); flag them as error.
    stage: (["uploading", "parsing", "matching", "saving", "queued"].includes(j.stage) ? "error" : j.stage) as Stage,
    failedStage: ["uploading", "parsing", "matching", "saving", "queued"].includes(j.stage) ? (j.stage as Stage) : j.failedStage,
    error: ["uploading", "parsing", "matching", "saving", "queued"].includes(j.stage)
      ? "Interrumpido por recarga de la página — volvé a subir el archivo"
      : j.error,
    result: j.result,
    attempt: j.attempt,
    maxAttempts: j.maxAttempts,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    durationMs: j.durationMs,
  }));
}

function loadPersistedJobs(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Job, "file" | "abort">>;
    return parsed.map((j) => ({
      ...j,
      file: null,
      abort: new AbortController(),
    }));
  } catch {
    return [];
  }
}

export default function DemoUploader({ onParsed }: { onParsed: (d: ParsedDemo) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>(() => loadPersistedJobs());
  const [result, setResult] = useState<ParsedDemo | null>(null);
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({}); // steam_id -> team_member.id
  const [assigning, setAssigning] = useState<string | null>(null);
  // Concurrency + retry settings (persisted across reloads)
  const [maxConcurrent, setMaxConcurrent] = useLocalStorage<number>("demo-uploader:maxConcurrent", 2);
  const [autoRetry, setAutoRetry] = useLocalStorage<boolean>("demo-uploader:autoRetry", true);
  const [maxAttempts, setMaxAttempts] = useLocalStorage<number>("demo-uploader:maxAttempts", 3);
  const [paused, setPaused] = useLocalStorage<boolean>("demo-uploader:paused", false);
  const [errorJobId, setErrorJobId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  // Search + filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>("all");
  // Refs so async pipeline sees current values without re-creating callbacks
  const startedRef = useRef<Set<string>>(new Set());
  const retryTimeoutsRef = useRef<Map<string, number>>(new Map());
  const { members: teamMembers } = useTeamMembers();
  const players = teamMembers.filter((m) => !m.is_coach);

  // Persist jobs (metadata + results) on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(serializeJobs(jobs)));
    } catch {
      /* quota — ignore */
    }
  }, [jobs]);

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
      const t0 = Date.now();
      try {
        current = "uploading";
        updateJob(job.id, { stage: current, startedAt: t0, finishedAt: null, durationMs: null });
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
        const t1 = Date.now();
        updateJob(job.id, { stage: "done", result: parsed, finishedAt: t1, durationMs: t1 - t0 });
        setResult(parsed);
        onParsed(parsed);
        toast.success(`Demo importada: ${job.fileName}`);
      } catch (e) {
        const err = e as Error;
        const t1 = Date.now();
        if (err.name === "AbortError") {
          updateJob(job.id, { stage: "cancelled", failedStage: current, finishedAt: t1, durationMs: t1 - t0 });
          toast.info(`Cancelada: ${job.fileName}`);
        } else {
          // Auto-retry only for parsing/matching stages
          const canAutoRetry = autoRetry && RETRIABLE_STAGES.includes(current) && job.attempt < job.maxAttempts;
          if (canAutoRetry) {
            const nextAttempt = job.attempt + 1;
            updateJob(job.id, { stage: "queued", failedStage: current, error: `Intento ${job.attempt}: ${err.message}`, attempt: nextAttempt, abort: new AbortController(), startedAt: null });
            startedRef.current.delete(job.id);
            toast.info(`Reintentando ${job.fileName} (${nextAttempt}/${job.maxAttempts})`);
            const backoff = 800 * job.attempt;
            const timer = window.setTimeout(() => {
              retryTimeoutsRef.current.delete(job.id);
            }, backoff);
            retryTimeoutsRef.current.set(job.id, timer);
          } else {
            updateJob(job.id, { stage: "error", failedStage: current, error: String(err.message), finishedAt: t1, durationMs: t1 - t0 });
            toast.error(`Falló ${job.fileName}`);
          }
        }
      } finally {
        // free the slot regardless of outcome
        startedRef.current.delete(job.id);
      }
    },
    [onParsed, updateJob, autoRetry],
  );

  // Scheduler: pick up "queued" jobs whenever a slot is free (unless paused)
  useEffect(() => {
    const runningIds = jobs.filter((j) => ["uploading", "parsing", "matching", "saving"].includes(j.stage)).map((j) => j.id);
    // ensure ref reflects actual running set
    runningIds.forEach((id) => startedRef.current.add(id));
    if (paused) return;
    const freeSlots = Math.max(0, maxConcurrent - runningIds.length);
    if (freeSlots === 0) return;
    const pending = jobs.filter((j) => j.stage === "queued" && !startedRef.current.has(j.id));
    for (const j of pending.slice(0, freeSlots)) {
      startedRef.current.add(j.id);
      // delay slightly so backoff timers can elapse; runPipeline sets stage
      window.setTimeout(() => runPipeline(j), 50);
    }
  }, [jobs, maxConcurrent, runPipeline, paused]);

  // Clean up pending retry timers on unmount
  useEffect(() => {
    return () => {
      retryTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
      retryTimeoutsRef.current.clear();
    };
  }, []);

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
        stage: "queued",
        failedStage: null,
        error: null,
        result: null,
        abort: new AbortController(),
        attempt: 1,
        maxAttempts: autoRetry ? maxAttempts : 1,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
      }));
      setJobs((prev) => [...prev, ...newJobs]);
      // scheduler effect will pick them up
    },
    [autoRetry, maxAttempts],
  );

  const cancelJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id);
      j?.abort.abort();
      // if it was queued (not yet running), transition it to cancelled directly
      if (j && j.stage === "queued") {
        return prev.map((x) => (x.id === id ? { ...x, stage: "cancelled" as Stage, failedStage: x.failedStage ?? "queued" } : x));
      }
      return prev;
    });
  }, []);

  const retryJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id);
      if (!j) return prev;
      startedRef.current.delete(id);
      return prev.map((x) =>
        x.id === id
          ? { ...x, stage: "queued" as Stage, failedStage: null, error: null, result: null, abort: new AbortController(), attempt: 1, maxAttempts: autoRetry ? maxAttempts : 1, startedAt: null, finishedAt: null, durationMs: null }
          : x,
      );
    });
  }, [autoRetry, maxAttempts]);

  const retryAllErrors = useCallback(() => {
    setJobs((prev) => {
      let count = 0;
      const next = prev.map((x) => {
        if (x.stage !== "error") return x;
        startedRef.current.delete(x.id);
        count++;
        return { ...x, stage: "queued" as Stage, failedStage: null, error: null, result: null, abort: new AbortController(), attempt: 1, maxAttempts: autoRetry ? maxAttempts : 1, startedAt: null, finishedAt: null, durationMs: null };
      });
      if (count > 0) toast.info(`Reintentando ${count} demo${count === 1 ? "" : "s"} con error`);
      return next;
    });
  }, [autoRetry, maxAttempts]);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id);
      if (j && (j.stage === "uploading" || j.stage === "parsing" || j.stage === "matching" || j.stage === "saving" || j.stage === "queued")) {
        j.abort.abort();
      }
      startedRef.current.delete(id);
      const t = retryTimeoutsRef.current.get(id);
      if (t) { window.clearTimeout(t); retryTimeoutsRef.current.delete(id); }
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.stage !== "done" && j.stage !== "error" && j.stage !== "cancelled"));
  }, []);

  const activeCount = jobs.filter((j) => ["uploading", "parsing", "matching", "saving"].includes(j.stage)).length;
  const queuedCount = jobs.filter((j) => j.stage === "queued").length;
  const doneCount = jobs.filter((j) => j.stage === "done").length;
  const errorCount = jobs.filter((j) => j.stage === "error").length;
  const cancelledCount = jobs.filter((j) => j.stage === "cancelled").length;
  const finishedCount = doneCount + errorCount + cancelledCount;
  const totalCount = jobs.length;
  const globalPct = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;
  const errorJob = errorJobId ? jobs.find((j) => j.id === errorJobId) ?? null : null;

  // Tick every second while there is work in flight (for ETA display)
  useEffect(() => {
    if (activeCount === 0 && queuedCount === 0) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [activeCount, queuedCount]);

  // ETA: use avg duration of finished jobs (fallback to elapsed of running jobs) divided by concurrency.
  const eta = useMemo(() => {
    const remaining = activeCount + queuedCount;
    if (remaining === 0 || paused) return null;
    const finishedDurations = jobs.filter((j) => j.durationMs != null && (j.stage === "done" || j.stage === "error" || j.stage === "cancelled")).map((j) => j.durationMs as number);
    const runningElapsed = jobs.filter((j) => j.startedAt && ["uploading","parsing","matching","saving"].includes(j.stage)).map((j) => nowTick - (j.startedAt as number));
    const samples = finishedDurations.length > 0 ? finishedDurations : runningElapsed;
    if (samples.length === 0) return null;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const conc = Math.max(1, Math.min(maxConcurrent, activeCount || maxConcurrent));
    // subtract already-elapsed portion of active jobs from the projected remaining time
    const elapsedActive = runningElapsed.reduce((a, b) => a + Math.min(b, avg), 0);
    const totalWork = avg * remaining;
    const etaMs = Math.max(0, (totalWork - elapsedActive) / conc);
    return etaMs;
  }, [jobs, activeCount, queuedCount, maxConcurrent, nowTick, paused]);

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

        {/* Concurrency + auto-retry settings */}
        <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] text-muted-foreground">Parseo simultáneo</Label>
              <Select value={String(maxConcurrent)} onValueChange={(v) => setMaxConcurrent(Number(v))}>
                <SelectTrigger className="h-7 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCURRENCY_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n} demo{n === 1 ? "" : "s"} a la vez
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                <span>Reintento automático</span>
                <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
              </Label>
              <div className="text-[10px] text-muted-foreground mt-1">Reintenta si falla el parsing o la vinculación</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] text-muted-foreground">Intentos máximos</Label>
              <Select value={String(maxAttempts)} onValueChange={(v) => setMaxAttempts(Number(v))} disabled={!autoRetry}>
                <SelectTrigger className="h-7 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETRY_ATTEMPT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      Hasta {n} intentos
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Global progress */}
        {totalCount > 0 && (
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-heading font-bold">
                <BarChart3 className="h-4 w-4 text-accent" />
                <span>Progreso global</span>
                <span className="text-muted-foreground font-body font-normal">
                  {finishedCount} / {totalCount} procesadas
                </span>
                {eta != null && (
                  <span className="text-muted-foreground font-body font-normal flex items-center gap-1">
                    <Timer className="h-3 w-3 text-accent" />
                    ETA <span className="text-accent tabular-nums">{formatEta(eta)}</span>
                  </span>
                )}
                {paused && (
                  <Badge variant="outline" className="h-5 border-accent/40 text-accent">
                    <Pause className="h-2.5 w-2.5 mr-1" /> Pausado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    setPaused((p) => {
                      const next = !p;
                      toast.info(next ? "Cola pausada" : "Cola reanudada");
                      return next;
                    });
                  }}
                >
                  {paused ? <><Play className="h-3 w-3 mr-1" /> Reanudar</> : <><Pause className="h-3 w-3 mr-1" /> Pausar</>}
                </Button>
                {errorCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-accent/40 text-accent hover:bg-accent/10"
                    onClick={retryAllErrors}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reintentar errores ({errorCount})
                  </Button>
                )}
                <span className="tabular-nums text-accent font-heading font-bold text-xs ml-1">{globalPct}%</span>
              </div>
            </div>
            <Progress value={globalPct} className="h-2" />
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {activeCount > 0 && (
                <Badge className="bg-accent/20 text-accent border-accent/30 h-5">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" /> {activeCount} en curso
                </Badge>
              )}
              {queuedCount > 0 && (
                <Badge variant="outline" className="h-5">
                  <Clock className="h-2.5 w-2.5 mr-1" /> {queuedCount} en cola
                </Badge>
              )}
              {doneCount > 0 && (
                <Badge className="bg-success/20 text-success border-success/30 h-5">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> {doneCount} listas
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive h-5">
                  <XCircle className="h-2.5 w-2.5 mr-1" /> {errorCount} con error
                </Badge>
              )}
              {cancelledCount > 0 && (
                <Badge variant="outline" className="h-5">
                  <Ban className="h-2.5 w-2.5 mr-1" /> {cancelledCount} canceladas
                </Badge>
              )}
            </div>
          </div>
        )}

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
                onShowError={() => setErrorJobId(j.id)}
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
      <ErrorDetailsDialog job={errorJob} onOpenChange={(open) => { if (!open) setErrorJobId(null); }} onRetry={() => { if (errorJob) { retryJob(errorJob.id); setErrorJobId(null); } }} />
    </Card>
  );
}

function formatEta(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${String(r).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

function ErrorDetailsDialog({ job, onOpenChange, onRetry }: { job: Job | null; onOpenChange: (open: boolean) => void; onRetry: () => void }) {
  const open = !!job;
  const stageLabel = job ? (STAGES.find((s) => s.key === job.failedStage)?.label ?? job.failedStage ?? "—") : "";
  const log = job
    ? [
        `Archivo: ${job.fileName}`,
        `Etapa: ${stageLabel}`,
        `Intento: ${job.attempt}/${job.maxAttempts}`,
        `Fecha: ${new Date().toISOString()}`,
        "",
        "Error:",
        job.error ?? "(sin mensaje)",
      ].join("\n")
    : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" /> Detalle del error
          </DialogTitle>
          <DialogDescription>
            {job ? (
              <>Falló durante <span className="text-destructive font-medium">{stageLabel}</span> · intento {job.attempt}/{job.maxAttempts}</>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {job && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Archivo</div>
            <div className="font-mono text-xs bg-muted/30 rounded p-2 break-all">{job.fileName}</div>
            <div className="text-xs text-muted-foreground">Log</div>
            <pre className="text-[11px] bg-muted/30 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">{log}</pre>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try { await navigator.clipboard.writeText(log); toast.success("Log copiado al portapapeles"); }
              catch { toast.error("No se pudo copiar el log"); }
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copiar log
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={onRetry}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reintentar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
  onOpen,
  onShowError,
  isSelected,
}: {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onOpen: () => void;
  onShowError: () => void;
  isSelected: boolean;
}) {
  const active = job.stage === "uploading" || job.stage === "parsing" || job.stage === "matching" || job.stage === "saving";
  const isQueued = job.stage === "queued";
  const currentPct = STAGES.find((s) => s.key === (job.stage === "error" || job.stage === "cancelled" ? job.failedStage : job.stage))?.pct ?? 0;
  const stageLabel = isQueued
    ? job.attempt > 1
      ? `En cola — reintento ${job.attempt}/${job.maxAttempts}`
      : "En cola"
    : STAGES.find((s) => s.key === job.stage)?.label ?? "";

  return (
    <div className={cn(
      "rounded-md border p-3 space-y-2 transition-colors",
      isSelected ? "border-accent/60 bg-accent/5" : isQueued ? "border-dashed border-border bg-card/20" : "border-border bg-card/40",
    )}>
      <div className="flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {job.stage === "error" ? (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : job.stage === "cancelled" ? (
            <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : job.stage === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          ) : isQueued ? (
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />
          )}
          <span className="truncate font-medium">{job.fileName}</span>
          {job.attempt > 1 && job.stage !== "done" && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-accent/40 text-accent">
              intento {job.attempt}/{job.maxAttempts}
            </Badge>
          )}
          <span className={cn(
            "truncate text-muted-foreground text-[10px] hidden sm:inline",
            job.stage === "error" && "text-destructive",
            job.stage === "done" && "text-success",
          )}>
            {job.stage === "error"
              ? `Falló en "${STAGES.find((s) => s.key === job.failedStage)?.label ?? "el proceso"}": ${job.error}`
              : job.stage === "cancelled"
                ? `Cancelado en "${STAGES.find((s) => s.key === job.failedStage)?.label ?? "el proceso"}"`
                : stageLabel}
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
          {(active || isQueued) && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onCancel}>
              <Ban className="h-3 w-3 mr-1" /> Cancelar
            </Button>
          )}
          {(job.stage === "error" || job.stage === "cancelled") && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-accent/40 text-accent hover:bg-accent/10" onClick={onRetry}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reintentar
            </Button>
          )}
          {job.stage === "error" && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10" onClick={onShowError}>
              <AlertCircle className="h-3 w-3 mr-1" /> Ver error
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
