import type { DemoData } from "@/components/MatchStatsDialog";
import { format } from "date-fns";

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

interface FileMeta {
  map?: string;
  date?: string; // ISO
  matchType?: string;
  rival?: string;
}

function baseName(meta: FileMeta, kind: string, ext: string) {
  const dt = meta.date ? format(new Date(meta.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const map = (meta.map ?? "match").toLowerCase().replace(/\s+/g, "-");
  const type = (meta.matchType ?? "demo").toLowerCase();
  return `hambrientos-${map}-${dt}-${type}-${kind}.${ext}`;
}

export function exportRoundsCSV(data: DemoData, meta: FileMeta = {}) {
  let usScore = 0;
  let themScore = 0;
  const rows = data.rounds.map((r) => {
    if (r.winner === "us") usScore++; else themScore++;
    return [
      r.n,
      r.us_side,
      r.winner === "us" ? (data.team_us?.name ?? "Us") : (data.team_them?.name ?? "Them"),
      r.winner_side,
      r.reason,
      r.survivors,
      r.enemy_remaining,
      r.is_pistol ? "yes" : "no",
      r.us_buy,
      r.them_buy,
      usScore,
      themScore,
    ];
  });
  const csv = toCSV(
    ["round", "our_side", "winner", "winner_side", "reason", "our_survivors", "their_survivors", "pistol", "our_buy", "their_buy", "our_score", "their_score"],
    rows,
  );
  download(baseName({ ...meta, map: meta.map ?? data.map }, "rounds", "csv"), "text/csv", csv);
}

export function exportRoundsJSON(data: DemoData, meta: FileMeta = {}) {
  const body = JSON.stringify(
    { meta: { ...meta, map: meta.map ?? data.map, rival: meta.rival ?? data.rival }, rounds: data.rounds },
    null,
    2,
  );
  download(baseName({ ...meta, map: meta.map ?? data.map }, "rounds", "json"), "application/json", body);
}

export function exportEconomyCSV(data: DemoData, meta: FileMeta = {}) {
  const teams: { key: "us" | "them"; label: string }[] = [
    { key: "us", label: data.team_us?.name ?? "Us" },
    { key: "them", label: data.team_them?.name ?? "Them" },
  ];
  const buyTypes = Array.from(
    new Set([
      ...Object.keys(data.economy?.us?.wins ?? {}),
      ...Object.keys(data.economy?.us?.losses ?? {}),
      ...Object.keys(data.economy?.them?.wins ?? {}),
      ...Object.keys(data.economy?.them?.losses ?? {}),
    ]),
  );
  const rows: unknown[][] = [];
  for (const t of teams) {
    for (const b of buyTypes) {
      const wins = data.economy?.[t.key]?.wins?.[b] ?? 0;
      const losses = data.economy?.[t.key]?.losses?.[b] ?? 0;
      const total = wins + losses;
      const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
      rows.push([t.label, b, wins, losses, total, `${wr}%`]);
    }
  }
  const csv = toCSV(["team", "buy_type", "wins", "losses", "total", "win_rate"], rows);
  download(baseName({ ...meta, map: meta.map ?? data.map }, "economy", "csv"), "text/csv", csv);
}

export function exportFullJSON(data: DemoData, meta: FileMeta = {}) {
  const body = JSON.stringify(
    { meta: { ...meta, map: meta.map ?? data.map, rival: meta.rival ?? data.rival, exported_at: new Date().toISOString() }, analysis: data },
    null,
    2,
  );
  download(baseName({ ...meta, map: meta.map ?? data.map }, "analysis", "json"), "application/json", body);
}
