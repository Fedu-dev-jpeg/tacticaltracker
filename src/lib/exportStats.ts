import type { DemoData } from "@/types/demo";
import { team1WonRound } from "@/lib/demoData";
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

interface FileMeta { map?: string; date?: string; matchType?: string; rival?: string; }

function baseName(demo: DemoData, meta: FileMeta, kind: string, ext: string) {
  const dt = meta.date ? format(new Date(meta.date), "yyyy-MM-dd") : format(new Date(demo.match.date ?? new Date()), "yyyy-MM-dd");
  const map = (meta.map ?? demo.match.map ?? "match").toLowerCase().replace(/\s+/g, "-");
  const type = (meta.matchType ?? demo.match.match_type ?? "demo").toLowerCase();
  return `hambrientos-${map}-${dt}-${type}-${kind}.${ext}`;
}

export function exportRoundsCSV(demo: DemoData, meta: FileMeta = {}) {
  let s1 = 0, s2 = 0;
  const rows = demo.rounds.map((r) => {
    const t1Won = team1WonRound(demo, r);
    if (t1Won) s1++; else s2++;
    return [
      r.round_number,
      r.winner_side,
      t1Won ? demo.match.teams.team1.name : demo.match.teams.team2.name,
      r.end_reason,
      r.is_pistol ? "yes" : "no",
      r.clutch ? `1v${r.clutch.vs} ${r.clutch.won ? "won" : "lost"}` : "",
      r.bomb?.planted ? (r.bomb.site ?? "planted") : "",
      r.buy_types.team1,
      r.buy_types.team2,
      r.economy.team1.avg_equip,
      r.economy.team2.avg_equip,
      s1, s2,
    ];
  });
  const csv = toCSV(
    ["round","winner_side","winner","end_reason","pistol","clutch","bomb","team1_buy","team2_buy","team1_equip","team2_equip","team1_score","team2_score"],
    rows,
  );
  download(baseName(demo, meta, "rounds", "csv"), "text/csv", csv);
}

export function exportRoundsJSON(demo: DemoData, meta: FileMeta = {}) {
  const body = JSON.stringify(
    { meta: { ...meta, map: meta.map ?? demo.match.map }, rounds: demo.rounds },
    null, 2,
  );
  download(baseName(demo, meta, "rounds", "json"), "application/json", body);
}

export function exportKillsCSV(demo: DemoData, meta: FileMeta = {}) {
  const rows: unknown[][] = [];
  for (const r of demo.rounds) {
    for (const k of r.kills) {
      rows.push([
        r.round_number, k.tick,
        demo.players[k.attacker]?.name ?? k.attacker,
        demo.players[k.victim]?.name ?? k.victim,
        k.assister ? (demo.players[k.assister]?.name ?? k.assister) : "",
        k.weapon, k.headshot ? "yes" : "no", k.wallbang ? "yes" : "no",
        k.distance, k.is_opening ? "yes" : "no",
      ]);
    }
  }
  const csv = toCSV(["round","tick","attacker","victim","assister","weapon","headshot","wallbang","distance","is_opening"], rows);
  download(baseName(demo, meta, "kills", "csv"), "text/csv", csv);
}

export function exportEconomyCSV(demo: DemoData, meta: FileMeta = {}) {
  const rows: unknown[][] = [];
  for (const team of ["team1", "team2"] as const) {
    const label = demo.match.teams[team].name;
    const summary = demo.buy_type_summary[team];
    for (const [buy, wl] of Object.entries(summary)) {
      const total = wl.wins + wl.losses;
      const wr = total > 0 ? Math.round((wl.wins / total) * 100) : 0;
      rows.push([label, buy, wl.wins, wl.losses, total, `${wr}%`]);
    }
  }
  const csv = toCSV(["team","buy_type","wins","losses","total","win_rate"], rows);
  download(baseName(demo, meta, "economy", "csv"), "text/csv", csv);
}

export function exportFullJSON(demo: DemoData, meta: FileMeta = {}) {
  const body = JSON.stringify(
    { meta: { ...meta, map: meta.map ?? demo.match.map, exported_at: new Date().toISOString() }, analysis: demo },
    null, 2,
  );
  download(baseName(demo, meta, "analysis", "json"), "application/json", body);
}
