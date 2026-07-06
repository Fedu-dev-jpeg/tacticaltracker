import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart3, Users, Bomb, Skull, Clock, Shield, Download, FileJson, FileSpreadsheet, Filter, X, Archive } from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { exportEconomyCSV, exportFullJSON, exportRoundsCSV, exportRoundsJSON, exportKillsCSV } from "@/lib/exportStats";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { DemoData, DemoRound, DemoPlayer, EndReason, BuyType, Side } from "@/types/demo";
import { migrateLegacyDemoData, team1WonRound, teamSide } from "@/lib/demoData";
import { BUY_SHORT, BUY_LABEL, END_REASON_LABEL } from "@/lib/demoLabels";
import { buildChartData, type ChartsData } from "@/lib/demoCharts";

// Re-exported for existing imports (`import MatchStatsDialog, { DemoData } from ...`).
export type { DemoData } from "@/types/demo";


export interface MatchStatsMeta {
  date?: string;
  matchType?: string;
  rival?: string;
  savedAt?: string; // ISO — when demo_data was persisted
  scoreUs?: number;
  scoreThem?: number;
}

export default function MatchStatsDialog({
  data,
  trigger,
  meta,
  mode = "live",
}: {
  data: DemoData | unknown;
  trigger?: React.ReactNode;
  meta?: MatchStatsMeta;
  mode?: "live" | "stored";
}) {
  const demo = useMemo(() => {
    const migrated = migrateLegacyDemoData(data);
    if (!migrated || typeof meta?.scoreUs !== "number" || typeof meta?.scoreThem !== "number") return migrated;
    return {
      ...migrated,
      match: {
        ...migrated.match,
        total_rounds: meta.scoreUs + meta.scoreThem,
        score: { team1: meta.scoreUs, team2: meta.scoreThem },
      },
      rounds: migrated.rounds.filter((r) => r.round_number <= meta.scoreUs + meta.scoreThem),
    };
  }, [data, meta?.scoreThem, meta?.scoreUs]);
  const [full, setFull] = useState(false);

  if (!demo) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          {trigger ?? (<Button variant="outline" size="sm" className="gap-2"><BarChart3 className="h-3.5 w-3.5" /> Stats</Button>)}
        </DialogTrigger>
        <DialogContent className="bg-background border-border max-w-md">
          <DialogHeader><DialogTitle>Análisis no disponible</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Los datos del análisis están vacíos o corruptos.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const storageKey = `stats-filters:${demo.match.map}|${demo.match.teams.team2.name}|${demo.match.score.team1}-${demo.match.score.team2}|${demo.match.total_rounds}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Stats
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={cn("bg-background border-border p-0", full ? "max-w-6xl max-h-[92vh] overflow-y-auto" : "max-w-3xl max-h-[92vh] overflow-y-auto")}>
        {!full ? (
          <MiniView demo={demo} meta={meta} mode={mode} storageKey={storageKey} onFull={() => setFull(true)} />
        ) : (
          <FullView demo={demo} meta={meta} mode={mode} storageKey={storageKey} onBack={() => setFull(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function displayTeamName(name: string | undefined | null, fallback: string): string {
  const n = (name ?? "").trim();
  if (!n || /^sin definir$/i.test(n) || n === "?") return fallback;
  return n;
}

function fmtScore(demo: DemoData): { t1: string; t2: string; known: boolean } {
  const t1 = demo.match.score.team1;
  const t2 = demo.match.score.team2;
  const rounds = demo.match.total_rounds;
  if (rounds <= 0 && t1 === 0 && t2 === 0) return { t1: "—", t2: "—", known: false };
  return { t1: String(t1), t2: String(t2), known: true };
}

function ScoreHeader({ demo }: { demo: DemoData }) {
  const s = fmtScore(demo);
  const team1Name = displayTeamName(demo.match.teams.team1.name, "Equipo 1");
  const team2Name = displayTeamName(demo.match.teams.team2.name, "Equipo 2");
  return (
    <div className="flex items-center justify-center gap-6 py-4 border-y border-border">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">?</div>
        <span>{team1Name}</span>
      </div>
      <div className={cn("font-heading text-3xl font-bold tabular-nums", !s.known && "text-muted-foreground")}>
        {s.t1} - {s.t2}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{team2Name}</span>
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">?</div>
      </div>
    </div>
  );
}

function StoredBanner({ meta }: { meta?: MatchStatsMeta }) {
  return (
    <div className="flex items-center gap-2 text-[11px] rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-accent">
      <Archive className="h-3.5 w-3.5" />
      <span>Análisis guardado{meta?.savedAt ? ` · ${new Date(meta.savedAt).toLocaleDateString()}` : ""} — abierto sin reparsear la demo.</span>
    </div>
  );
}

function ExportMenu({ demo, meta }: { demo: DemoData; meta?: MatchStatsMeta }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Round Analysis</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => exportRoundsCSV(demo, meta)}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Rondas · CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportRoundsJSON(demo, meta)}>
          <FileJson className="h-3.5 w-3.5 mr-2" /> Rondas · JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportKillsCSV(demo, meta)}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Kills · CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Economía</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => exportEconomyCSV(demo, meta)}>
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Breakdown · CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exportFullJSON(demo, meta)}>
          <FileJson className="h-3.5 w-3.5 mr-2" /> Análisis completo · JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MiniView({ demo, meta, mode, storageKey, onFull }: { demo: DemoData; meta?: MatchStatsMeta; mode: "live" | "stored"; storageKey: string; onFull: () => void }) {
  const team1 = Object.values(demo.players).filter((p) => p.team === "team1");
  const team2 = Object.values(demo.players).filter((p) => p.team === "team2");
  return (
    <div className="p-5 space-y-3">
      <DialogHeader className="mb-1">
        <DialogTitle className="text-lg font-heading">Match Statistics</DialogTitle>
        <div className="text-xs text-muted-foreground">Player performance data</div>
      </DialogHeader>
      {mode === "stored" && <StoredBanner meta={meta} />}
      <div className="flex items-center justify-between gap-4">
        <ScoreHeader demo={demo} />
        <div className="flex items-center gap-2">
          <ExportMenu demo={demo} meta={meta} />
          <Button variant="outline" size="sm" onClick={onFull}>View Full Stats</Button>
        </div>
      </div>
      <MiniTeamTable label={displayTeamName(demo.match.teams.team2.name, "Equipo 2")} players={team2} totalRounds={demo.match.total_rounds} />
      <MiniTeamTable label={displayTeamName(demo.match.teams.team1.name, "Equipo 1")} players={team1} totalRounds={demo.match.total_rounds} className="mt-3" />
      <RoundsTimeline demo={demo} storageKey={storageKey} compact />
    </div>
  );
}

function plusMinus(p: DemoPlayer) { return p.stats.kills - p.stats.deaths; }
function kda(p: DemoPlayer) { return `${p.stats.kills}/${p.stats.deaths}/${p.stats.assists}`; }
function fmtAdr(p: DemoPlayer, totalRounds: number): string {
  // Defensive: legacy payloads sometimes stored raw total damage in `adr`.
  // Recompute from damage/rounds when the stored value looks like total damage
  // (implausibly high). If we don't know round count, show a dash.
  if (!totalRounds || totalRounds <= 0) return "—";
  const stored = p.stats.adr;
  const raw = p.stats.damage;
  const val = stored > 200 && raw > 0 ? raw / totalRounds : stored;
  if (!Number.isFinite(val) || val <= 0) return "—";
  return val.toFixed(1);
}
function fmtKast(p: DemoPlayer): { text: string; known: boolean } {
  if (p.stats.kast == null || p.stats.kast === 0) return { text: "—", known: false };
  return { text: `${p.stats.kast.toFixed(0)}%`, known: true };
}
function fmtRating(p: DemoPlayer): { text: string; known: boolean } {
  if (p.stats.rating == null || p.stats.rating === 0) return { text: "—", known: false };
  return { text: p.stats.rating.toFixed(2), known: true };
}

function MiniTeamTable({ label, players, totalRounds, className }: { label: string; players: DemoPlayer[]; totalRounds: number; className?: string }) {
  return (
    <div className={cn("border border-border rounded-md overflow-hidden", className)}>
      <div className="px-3 py-2 bg-muted/40 text-xs font-heading flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-background flex items-center justify-center text-[9px]">?</div>
        {label}
      </div>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase text-muted-foreground bg-muted/20">
          <tr>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="px-2 py-2 text-right">K/D/A</th>
            <th className="px-2 py-2 text-right">+/-</th>
            <th className="px-2 py-2 text-right">ADR</th>
            <th className="px-2 py-2 text-right">KAST</th>
            <th className="px-2 py-2 text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const pm = plusMinus(p);
            return (
              <tr key={p.steamid} className="border-t border-border/40">
                <td className="px-3 py-2 flex items-center gap-2">
                  <Avatar className="h-5 w-5"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[8px]">{(p.name ?? "?")[0]}</AvatarFallback></Avatar>
                  <span>{p.name}</span>
                </td>
                <td className="px-2 py-2 text-right font-mono">{kda(p)}</td>
                <td className={cn("px-2 py-2 text-right font-mono", pm >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pm >= 0 ? "+" : ""}{pm}
                </td>
                <td className="px-2 py-2 text-right font-mono">{fmtAdr(p, totalRounds)}</td>
                {(() => { const k = fmtKast(p); return (
                  <td className={cn("px-2 py-2 text-right font-mono", !k.known && "text-muted-foreground", k.known && (p.stats.kast ?? 0) < 60 && "text-red-400")}>{k.text}</td>
                ); })()}
                {(() => { const r = fmtRating(p); return (
                  <td className={cn("px-2 py-2 text-right font-mono", !r.known && "text-muted-foreground", r.known && (p.stats.rating ?? 0) >= 1.0 && "text-emerald-400", r.known && (p.stats.rating ?? 0) < 0.9 && "text-red-400")}>{r.text}</td>
                ); })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function FullView({ demo, meta, mode, storageKey, onBack }: { demo: DemoData; meta?: MatchStatsMeta; mode: "live" | "stored"; storageKey: string; onBack: () => void }) {
  const team1All = Object.values(demo.players).filter((p) => p.team === "team1");
  const team2All = Object.values(demo.players).filter((p) => p.team === "team2");
  const charts = useMemo(() => buildChartData(demo), [demo]);

  // Side splits based on first_half_side
  const filterBySide = (players: DemoPlayer[], team: "team1" | "team2", side: Side) => {
    // For a side-specific table, we don't have per-side stat splits without per_round → show players whose team spent >= 12 rounds on that side, otherwise full stats
    // Show all players either way; badge indicates half.
    const half = (demo.match.teams[team].first_half_side === side) ? "1st" : "2nd";
    return players.map((p) => ({ p, half }));
  };

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">
          <button onClick={onBack} className="hover:text-accent">Stats</button> <span className="mx-1">›</span> <span className="text-accent">Full Analysis</span>
        </div>
        <ExportMenu demo={demo} meta={meta} />
      </div>

      {mode === "stored" && <StoredBanner meta={meta} />}

      <div className="rounded-lg border border-border p-6 text-center space-y-3">
        <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Shield className="h-4 w-4 text-accent" /> {demo.match.map}
        </div>
        <ScoreHeader demo={demo} />
      </div>

      <div className="text-center">
        <h3 className="font-heading font-bold">Detailed Statistics</h3>
        <p className="text-xs text-muted-foreground">Complete player statistics for all maps</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-accent" />
          <span className="font-heading font-bold">Player Statistics</span>
        </div>
        <div className="text-xs text-muted-foreground">Individual performance metrics for each player</div>
        <Tabs defaultValue="both">
          <TabsList>
            <TabsTrigger value="both">Ambos lados</TabsTrigger>
            <TabsTrigger value="ct">CT Side</TabsTrigger>
            <TabsTrigger value="t">T Side</TabsTrigger>
          </TabsList>
          <TabsContent value="both" className="mt-4 space-y-4">
            <FullTeamTable label={displayTeamName(demo.match.teams.team2.name, "Equipo 2")} players={team2All} totalRounds={demo.match.total_rounds} />
            <FullTeamTable label={displayTeamName(demo.match.teams.team1.name, "Equipo 1")} players={team1All} totalRounds={demo.match.total_rounds} />
          </TabsContent>
          <TabsContent value="ct" className="mt-4 space-y-4">
            <SideBadgeNote demo={demo} side="CT" />
            <FullTeamTable label={`${displayTeamName(demo.match.teams.team2.name, "Equipo 2")} · CT (${demo.match.teams.team2.first_half_side === "CT" ? "1er tiempo" : "2do tiempo"})`} players={team2All} totalRounds={demo.match.total_rounds} />
            <FullTeamTable label={`${displayTeamName(demo.match.teams.team1.name, "Equipo 1")} · CT (${demo.match.teams.team1.first_half_side === "CT" ? "1er tiempo" : "2do tiempo"})`} players={team1All} totalRounds={demo.match.total_rounds} />
          </TabsContent>
          <TabsContent value="t" className="mt-4 space-y-4">
            <SideBadgeNote demo={demo} side="TERRORIST" />
            <FullTeamTable label={`${displayTeamName(demo.match.teams.team2.name, "Equipo 2")} · T (${demo.match.teams.team2.first_half_side === "TERRORIST" ? "1er tiempo" : "2do tiempo"})`} players={team2All} totalRounds={demo.match.total_rounds} />
            <FullTeamTable label={`${displayTeamName(demo.match.teams.team1.name, "Equipo 1")} · T (${demo.match.teams.team1.first_half_side === "TERRORIST" ? "1er tiempo" : "2do tiempo"})`} players={team1All} totalRounds={demo.match.total_rounds} />
          </TabsContent>
        </Tabs>
      </div>

      <RoundsTimeline demo={demo} storageKey={storageKey} />
      <RoundsDetail demo={demo} />
      <PerformanceCharts charts={charts} />
    </div>
  );
}

function SideBadgeNote({ demo, side }: { demo: DemoData; side: Side }) {
  return (
    <div className="text-[11px] text-muted-foreground border border-border/40 rounded px-3 py-2 bg-muted/10">
      Mostrando stats agregadas — el split por side exacto requiere per-round data del parser real.
      Team 1 arrancó como <b className="text-foreground">{demo.match.teams.team1.first_half_side}</b>, Team 2 como <b className="text-foreground">{demo.match.teams.team2.first_half_side}</b>.
    </div>
  );
}

function fmtImpact(p: DemoPlayer, totalRounds: number): string {
  if (!totalRounds || totalRounds <= 0) return "—";
  const kpr = p.stats.kills / totalRounds;
  const apr = p.stats.assists / totalRounds;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  return impact.toFixed(1);
}

function FullTeamTable({ label, players, totalRounds = 0 }: { label: string; players: DemoPlayer[]; totalRounds?: number }) {
  const sorted = [...players].sort((a, b) => {
    const ra = a.stats.rating ?? 0;
    const rb = b.stats.rating ?? 0;
    if (ra !== rb) return rb - ra;
    return (b.stats.kills - b.stats.deaths) - (a.stats.kills - a.stats.deaths);
  });
  return (
    <div>
      <div className="text-sm font-heading font-bold mb-2 flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px]">?</div>
        {label}
      </div>
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground bg-muted/20">
            <tr>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-2 py-2 text-right">K/D/A</th>
              <th className="px-2 py-2 text-right">+/-</th>
              <th className="px-2 py-2 text-right">ADR</th>
              <th className="px-2 py-2 text-right">KAST%</th>
              <th className="px-2 py-2 text-right">Rating</th>
              <th className="px-2 py-2 text-right">Impact</th>
              <th className="px-2 py-2 text-right">Damage</th>
              <th className="px-2 py-2 text-right">Entry K/D</th>
              <th className="px-2 py-2 text-right">Trades</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const pm = plusMinus(p);
              return (
                <tr key={p.steamid} className="border-t border-border/40">
                  <td className="px-3 py-2 flex items-center gap-2">
                    <Avatar className="h-5 w-5"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[8px]">{(p.name ?? "?")[0]}</AvatarFallback></Avatar>
                    <span>{p.name}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{kda(p)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono", pm >= 0 ? "text-emerald-400" : "text-red-400")}>{pm >= 0 ? "+" : ""}{pm}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtAdr(p, totalRounds)}</td>
                  {(() => { const k = fmtKast(p); return (
                    <td className={cn("px-2 py-2 text-right font-mono", !k.known && "text-muted-foreground", k.known && (p.stats.kast ?? 0) < 60 && "text-red-400")}>{k.text}</td>
                  ); })()}
                  {(() => { const r = fmtRating(p); return (
                    <td className={cn("px-2 py-2 text-right font-mono", !r.known && "text-muted-foreground", r.known && (p.stats.rating ?? 0) >= 1.0 && "text-emerald-400", r.known && (p.stats.rating ?? 0) < 0.9 && "text-red-400")}>{r.text}</td>
                  ); })()}
                  <td className="px-2 py-2 text-right font-mono">{fmtImpact(p, totalRounds)}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.damage}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.first_kills}/{p.stats.first_deaths}</td>
                  <td className="px-2 py-2 text-right font-mono">—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Rounds timeline (v2)
// ============================================================================
type SideFilter = "all" | "CT" | "TERRORIST";
type ResultFilter = "all" | "team1_win" | "team2_win";
const REASONS: EndReason[] = ["target_bombed", "bomb_defused", "ct_elimination", "t_elimination", "round_time_expired"];

interface RoundsFilterState {
  side: SideFilter;
  result: ResultFilter;
  reasons: EndReason[];
  onlyPistol: boolean;
  onlyClutch: boolean;
}
const DEFAULT_FILTERS: RoundsFilterState = { side: "all", result: "all", reasons: [], onlyPistol: false, onlyClutch: false };

function RoundsTimeline({ demo, storageKey, compact }: { demo: DemoData; storageKey: string; compact?: boolean }) {
  const [filters, setFilters] = useLocalStorage<RoundsFilterState>(storageKey, DEFAULT_FILTERS);
  const { side, result, reasons, onlyPistol, onlyClutch } = filters;
  const reasonSet = useMemo(() => new Set<EndReason>(reasons), [reasons]);
  const rounds = demo.rounds;
  const matches = useMemo(() => {
    const set = new Set<number>();
    rounds?.forEach((r) => {
      const t1Won = team1WonRound(demo, r);
      const team1SideThisRound = teamSide(demo, "team1", r.round_number);
      if (side !== "all" && team1SideThisRound !== side) return;
      if (result === "team1_win" && !t1Won) return;
      if (result === "team2_win" && t1Won) return;
      if (reasonSet.size > 0 && !reasonSet.has(r.end_reason)) return;
      if (onlyPistol && !r.is_pistol) return;
      if (onlyClutch && !r.clutch) return;
      set.add(r.round_number);
    });
    return set;
  }, [demo, rounds, side, result, reasonSet, onlyPistol, onlyClutch]);

  if (!rounds || rounds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <h3 className="font-heading font-bold text-sm">{compact ? "Round Timeline" : "Round Analysis"}</h3>
        <p className="text-xs text-muted-foreground mt-1">Pendiente de parser completo — el análisis por rounds aún no está disponible para esta demo.</p>
      </div>
    );
  }

  const setSide = (s: SideFilter) => setFilters((f) => ({ ...f, side: s }));
  const setResult = (r: ResultFilter) => setFilters((f) => ({ ...f, result: r }));
  const toggleReason = (r: EndReason) =>
    setFilters((f) => ({ ...f, reasons: f.reasons.includes(r) ? f.reasons.filter((x) => x !== r) : [...f.reasons, r] }));
  const setOnlyPistol = (v: boolean) => setFilters((f) => ({ ...f, onlyPistol: v }));
  const setOnlyClutch = (v: boolean) => setFilters((f) => ({ ...f, onlyClutch: v }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const filtersActive = side !== "all" || result !== "all" || reasonSet.size > 0 || onlyPistol || onlyClutch;

  const half1 = rounds.filter((r) => r.round_number <= 12);
  const half2 = rounds.filter((r) => r.round_number > 12);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-center">
        <h3 className="font-heading font-bold">{compact ? "Round Timeline" : "Round Analysis"}</h3>
        <p className="text-xs text-muted-foreground">
          {compact ? "Filtros y timeline · se guardan al cerrar el diálogo" : "Round by round breakdown con ganador, motivo y economía"}
        </p>
      </div>

      <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-heading font-bold text-muted-foreground uppercase tracking-widest">
          <Filter className="h-3 w-3" /> Filtros
          <span className="ml-auto font-body normal-case tracking-normal text-muted-foreground">
            Mostrando <span className="text-accent font-bold">{matches.size}</span> / {rounds.length}
          </span>
          {filtersActive && (
            <button onClick={resetFilters} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-destructive normal-case tracking-normal">
              <X className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">Team 1 side:</span>
          {(["all", "CT", "TERRORIST"] as SideFilter[]).map((s) => (
            <FilterChip key={s} active={side === s} onClick={() => setSide(s)}>
              {s === "all" ? "Todos" : s === "CT" ? "CT" : "T"}
            </FilterChip>
          ))}
          <span className="text-muted-foreground ml-2">Resultado:</span>
          {(["all", "team1_win", "team2_win"] as ResultFilter[]).map((r) => (
            <FilterChip key={r} active={result === r} onClick={() => setResult(r)}>
              {r === "all" ? "Todos" : r === "team1_win" ? "Team 1" : "Team 2"}
            </FilterChip>
          ))}
          {!compact && (
            <>
              <span className="text-muted-foreground ml-2">Motivo:</span>
              {REASONS.map((r) => (
                <FilterChip key={r} active={reasonSet.has(r)} onClick={() => toggleReason(r)}>
                  {END_REASON_LABEL[r]}
                </FilterChip>
              ))}
            </>
          )}
          <FilterChip active={onlyPistol} onClick={() => setOnlyPistol(!onlyPistol)}>Pistol</FilterChip>
          <FilterChip active={onlyClutch} onClick={() => setOnlyClutch(!onlyClutch)}>Clutch</FilterChip>
        </div>
      </div>

      <div className="rounded-md border border-border/40 p-3 space-y-3">
        <div className="text-xs font-heading font-bold flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-accent" /> Rounds Timeline
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 overflow-x-auto">
          {half1.map((r) => <RoundCell key={r.round_number} demo={demo} round={r} highlighted={matches.has(r.round_number)} dimmed={filtersActive && !matches.has(r.round_number)} />)}
        </div>
        <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border py-1">Half Time</div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 overflow-x-auto">
          {half2.map((r) => <RoundCell key={r.round_number} demo={demo} round={r} highlighted={matches.has(r.round_number)} dimmed={filtersActive && !matches.has(r.round_number)} />)}
        </div>
        <TimelineLegend />
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors",
        active
          ? "border-accent bg-accent/20 text-accent"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40",
      )}
    >
      {children}
    </button>
  );
}

function computeSurvivors(demo: DemoData, r: DemoRound): { ct: number; t: number } {
  let deathsCT = 0, deathsT = 0;
  const team1Side = teamSide(demo, "team1", r.round_number);
  for (const k of r.kills) {
    const victimPlayer = demo.players[k.victim];
    if (!victimPlayer) continue;
    const victimSide = victimPlayer.team === "team1" ? team1Side : (team1Side === "CT" ? "TERRORIST" : "CT");
    if (victimSide === "CT") deathsCT++;
    else deathsT++;
  }
  return { ct: Math.max(0, 5 - deathsCT), t: Math.max(0, 5 - deathsT) };
}

function RoundCell({ demo, round: r, highlighted, dimmed }: { demo: DemoData; round: DemoRound; highlighted?: boolean; dimmed?: boolean }) {
  const t1Won = team1WonRound(demo, r);
  const winnerLabel = t1Won ? demo.match.teams.team1.name : demo.match.teams.team2.name;
  const surv = computeSurvivors(demo, r);
  return (
    <div
      className={cn(
        "border rounded p-1.5 text-center text-[9px] space-y-0.5 bg-muted/10 transition-all",
        "border-border/50",
        dimmed && "opacity-25",
        highlighted && "ring-2 ring-accent ring-offset-1 ring-offset-background border-accent/60 bg-accent/5",
      )}
      title={`R${r.round_number} · ${END_REASON_LABEL[r.end_reason]}`}
    >
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        <span>R{r.round_number}</span>
        {r.is_pistol && <span className="text-yellow-300 font-bold">P</span>}
        {r.clutch && <span className="text-orange-400 font-bold">1v{r.clutch.vs}</span>}
      </div>
      <div className={cn("rounded-sm px-1 font-heading text-[10px]", r.winner_side === "CT" ? "bg-blue-500/30 text-blue-300" : "bg-orange-500/30 text-orange-300")}>
        {r.winner_side === "CT" ? "CT" : "T"}
      </div>
      <div className="font-medium truncate">{winnerLabel}</div>
      <div className="flex items-center justify-center gap-1 text-[8px]">
        {r.end_reason === "target_bombed" && <Bomb className="h-2.5 w-2.5 text-red-400" />}
        {r.end_reason === "bomb_defused" && <Shield className="h-2.5 w-2.5 text-blue-400" />}
        {(r.end_reason === "ct_elimination" || r.end_reason === "t_elimination") && <Skull className="h-2.5 w-2.5" />}
        {r.end_reason === "round_time_expired" && <Clock className="h-2.5 w-2.5" />}
      </div>
      <div className="text-[8px] text-muted-foreground">{surv.ct}🅐 - {surv.t}🅐</div>
      <div className="flex justify-center gap-0.5">
        <BuyPill t={r.buy_types.team1} /> <BuyPill t={r.buy_types.team2} />
      </div>
    </div>
  );
}

function BuyPill({ t }: { t: BuyType }) {
  const colors: Record<BuyType, string> = {
    pistol: "bg-yellow-500/30 text-yellow-300",
    full_eco: "bg-red-500/30 text-red-300",
    eco: "bg-orange-500/30 text-orange-300",
    half_buy: "bg-blue-500/30 text-blue-300",
    full_buy: "bg-emerald-500/30 text-emerald-300",
  };
  return <span className={cn("text-[8px] rounded px-1 font-mono", colors[t])}>{BUY_SHORT[t]}</span>;
}

function TimelineLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-3 text-[9px] text-muted-foreground border-t border-border pt-2">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> CT gana</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> T gana</span>
      <span className="flex items-center gap-1"><Bomb className="h-2.5 w-2.5 text-red-400" /> Bomba</span>
      <span className="flex items-center gap-1"><Shield className="h-2.5 w-2.5 text-blue-400" /> Defuse</span>
      <span className="flex items-center gap-1"><Skull className="h-2.5 w-2.5" /> Elim</span>
      <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Tiempo</span>
      <span className="flex items-center gap-1">Buys:</span>
      {(["pistol","full_eco","eco","half_buy","full_buy"] as BuyType[]).map((b) => (
        <span key={b} className="flex items-center gap-1"><BuyPill t={b} /> {BUY_LABEL[b]}</span>
      ))}
    </div>
  );
}

// ============================================================================
// Rondas Detalladas
// ============================================================================
function RoundsDetail({ demo }: { demo: DemoData }) {
  const [openRound, setOpenRound] = useState<number | null>(null);
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-center">
        <h3 className="font-heading font-bold">Rondas Detalladas</h3>
        <p className="text-xs text-muted-foreground">Kills, bomba, clutch y economía por ronda</p>
      </div>
      <div className="max-h-80 overflow-y-auto border border-border/40 rounded-md divide-y divide-border/40">
        {demo.rounds.map((r) => {
          const isOpen = openRound === r.round_number;
          return (
            <div key={r.round_number}>
              <button
                onClick={() => setOpenRound(isOpen ? null : r.round_number)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/20 text-left text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono w-8">R{r.round_number}</span>
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-heading", r.winner_side === "CT" ? "bg-blue-500/30 text-blue-300" : "bg-orange-500/30 text-orange-300")}>
                    {r.winner_side === "CT" ? "CT" : "T"}
                  </span>
                  <span className="text-muted-foreground">{END_REASON_LABEL[r.end_reason]}</span>
                  {r.clutch && <span className="text-orange-400 font-bold">1v{r.clutch.vs} · {r.clutch.won ? "won" : "lost"}</span>}
                  {r.bomb?.planted && <span className="text-red-400">Bomba {r.bomb.site ?? ""}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <BuyPill t={r.buy_types.team1} />
                  <BuyPill t={r.buy_types.team2} />
                </div>
              </button>
              {isOpen && (
                <div className="px-6 py-2 bg-muted/10 text-[11px] space-y-1">
                  {r.kills.length === 0 && <div className="text-muted-foreground italic">Sin kills registradas (simulador). El parser real las va a poblar.</div>}
                  {r.kills.map((k, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono">
                      <span>{demo.players[k.attacker]?.name ?? k.attacker}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{demo.players[k.victim]?.name ?? k.victim}</span>
                      <span className="text-muted-foreground">({k.weapon}{k.headshot ? " · HS" : ""}{k.wallbang ? " · wb" : ""})</span>
                      {k.is_opening && <span className="text-yellow-300">opening</span>}
                    </div>
                  ))}
                  <div className="text-muted-foreground pt-1 border-t border-border/40 mt-1">
                    Economía · T1 equip ${r.economy.team1.avg_equip} · T2 equip ${r.economy.team2.avg_equip}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Charts (derived, not persisted)
// ============================================================================
function PerformanceCharts({ charts }: { charts: ChartsData }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="text-center">
        <h3 className="font-heading font-bold">Performance Charts</h3>
        <p className="text-xs text-muted-foreground">Derivado en tiempo real desde rounds + players</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RechartsBarCard title="Player Rating" subtitle="Performance rating" data={charts.player_rating} color="#8b5cf6" />
        <RechartsAreaCard title="Damage Per Round" subtitle="ADR" data={charts.damage_per_round} color="#22c55e" />
        <RechartsBarCard title="Total Damage" subtitle="Daño total" data={charts.total_damage} color="#f59e0b" />
        <RechartsEntryCard data={charts.entry} />
      </div>
    </div>
  );
}

function RechartsBarCard({ title, subtitle, data, color }: { title: string; subtitle: string; data: { tag: string; value: number }[]; color: string }) {
  return (
    <div className="border border-border/50 rounded-lg p-3 bg-[#1a1a2e]">
      <div className="text-xs font-heading font-bold text-accent">{title}</div>
      <div className="text-[10px] text-muted-foreground mb-2">{subtitle}</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="tag" tick={{ fontSize: 9, fill: "#999" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 9, fill: "#999" }} width={35} />
          <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RechartsAreaCard({ title, subtitle, data, color }: { title: string; subtitle: string; data: { tag: string; value: number }[]; color: string }) {
  return (
    <div className="border border-border/50 rounded-lg p-3 bg-[#1a1a2e]">
      <div className="text-xs font-heading font-bold text-accent">{title}</div>
      <div className="text-[10px] text-muted-foreground mb-2">{subtitle}</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="tag" tick={{ fontSize: 9, fill: "#999" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 9, fill: "#999" }} width={35} />
          <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }} />
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RechartsEntryCard({ data }: { data: { tag: string; fk: number; fd: number; trades: number }[] }) {
  return (
    <div className="border border-border/50 rounded-lg p-3 bg-[#1a1a2e]">
      <div className="text-xs font-heading font-bold text-accent">Entry Fragging & Trading</div>
      <div className="text-[10px] text-muted-foreground mb-2">Entry Kills, Entry Deaths & Trades</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="tag" tick={{ fontSize: 9, fill: "#999" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 9, fill: "#999" }} width={25} />
          <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="fk" name="Entry Kills" fill="#22c55e" radius={[2, 2, 0, 0]} />
          <Bar dataKey="fd" name="Entry Deaths" fill="#f97316" radius={[2, 2, 0, 0]} />
          <Bar dataKey="trades" name="Trades" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
