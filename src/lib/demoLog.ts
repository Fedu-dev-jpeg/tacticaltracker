// Structured logger for the demo import pipeline.
//
// Every step in DemoUploader → Web Worker → seek-bzip → @deademx/cs2 parser →
// storage upload → parse-demo edge function pushes one entry here, tagged with
// the job id. The user can then click "Log" on any job row to download the
// full trace as a .txt for you to inspect.

export type DemoLogLevel = "info" | "warn" | "error" | "debug";

export interface DemoLogEntry {
  t: number;            // ms epoch
  dt: number;           // ms since job start
  scope: string;        // "uploader" | "worker" | "worker:bz2" | "worker:parse" | "edge" | ...
  event: string;        // short event name ("stage-start", "round_end", "invoke-response")
  level: DemoLogLevel;
  data?: unknown;
}

interface JobLog {
  jobId: string;
  fileName: string;
  startedAt: number;
  entries: DemoLogEntry[];
}

const jobs = new Map<string, JobLog>();

function safeClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return String(v);
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      return v;
    }));
  } catch {
    return String(value);
  }
}

export function startJobLog(jobId: string, fileName: string): void {
  jobs.set(jobId, { jobId, fileName, startedAt: Date.now(), entries: [] });
}

export function log(
  jobId: string,
  scope: string,
  event: string,
  data?: unknown,
  level: DemoLogLevel = "info",
): void {
  let job = jobs.get(jobId);
  if (!job) {
    // Allow logging even if start was skipped (defensive).
    job = { jobId, fileName: jobId, startedAt: Date.now(), entries: [] };
    jobs.set(jobId, job);
  }
  const now = Date.now();
  const entry: DemoLogEntry = {
    t: now,
    dt: now - job.startedAt,
    scope,
    event,
    level,
    data: data === undefined ? undefined : safeClone(data),
  };
  job.entries.push(entry);
  // Mirror to console so it's visible in DevTools too.
  const prefix = `[demo:${scope}] ${event}`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
  if (entry.data === undefined) fn(prefix);
  else fn(prefix, entry.data);
}

export function getJobLog(jobId: string): JobLog | null {
  return jobs.get(jobId) ?? null;
}

export function formatJobLog(jobId: string): string {
  const job = jobs.get(jobId);
  if (!job) return `# No hay log para el job ${jobId}\n`;
  const lines: string[] = [];
  lines.push(`# Demo import log`);
  lines.push(`# job_id:    ${job.jobId}`);
  lines.push(`# file:      ${job.fileName}`);
  lines.push(`# started:   ${new Date(job.startedAt).toISOString()}`);
  lines.push(`# entries:   ${job.entries.length}`);
  lines.push(`# ua:        ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`);
  lines.push("");
  lines.push("t(ms)  Δms   level  scope                          event");
  lines.push("─────  ────  ─────  ─────────────────────────────  ───────────────────────────────");
  for (const e of job.entries) {
    const dt = String(e.dt).padStart(6, " ");
    const level = e.level.padEnd(5, " ");
    const scope = e.scope.padEnd(28, " ").slice(0, 28);
    const event = e.event;
    lines.push(`${new Date(e.t).toISOString().slice(11, 23)}  ${dt}  ${level}  ${scope}   ${event}`);
    if (e.data !== undefined) {
      const dataStr = typeof e.data === "string" ? e.data : JSON.stringify(e.data, null, 2);
      for (const line of dataStr.split("\n")) {
        lines.push(`                                                                        ${line}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

export function downloadJobLog(jobId: string): void {
  const text = formatJobLog(jobId);
  const job = jobs.get(jobId);
  const safeName = (job?.fileName ?? jobId).replace(/[^a-z0-9._-]/gi, "_");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `demo-log-${safeName}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyJobLog(jobId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(formatJobLog(jobId));
    return true;
  } catch {
    return false;
  }
}

export function clearJobLog(jobId: string): void {
  jobs.delete(jobId);
}
