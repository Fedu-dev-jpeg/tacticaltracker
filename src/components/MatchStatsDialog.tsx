import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart3, User, Users, Bomb, Skull, Clock, Shield, Download, FileJson, FileSpreadsheet, Filter, X, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportEconomyCSV, exportFullJSON, exportRoundsCSV, exportRoundsJSON, exportKillsCSV } from "@/lib/exportStats";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { DemoData, DemoRound, DemoPlayer, EndReason, BuyType, Side, DeducedRole } from "@/types/demo";
import { migrateLegacyDemoData, team1WonRound, teamSide } from "@/lib/demoData";
import { BUY_SHORT, BUY_LABEL, END_REASON_LABEL } from "@/lib/demoLabels";
import { buildChartData, type ChartsData } from "@/lib/demoCharts";

// Re-exported for existing imports (`import MatchStatsDialog, { DemoData } from ...`).
export type { DemoData } from "@/types/demo";

const ROLE_COLORS: Record<string, string> = {
  AWPer: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  Entry: "bg-red-500/20 text-red-400 border-red-500/40",
  Lurker: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  Support: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
};

export interface MatchStatsMeta {
  date?: string;
  matchType?: string;
  rival?: string;
  savedAt?: string; // ISO — when demo_data was persisted
}

export default function MatchStatsDialog({
  data,
  trigger,
  meta,
  mode = "live",
}: {
  data: DemoData | any;
  trigger?: React.ReactNode;
  meta?: MatchStatsMeta;
  mode?: "live" | "stored";
}) {
  const demo = useMemo(() => migrateLegacyDemoData(data), [data]);
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
  return p.stats.kast > 0 ? { text: `${p.stats.kast.toFixed(0)}%`, known: true } : { text: "—", known: false };
}
function fmtRating(p: DemoPlayer): { text: string; known: boolean } {
  return p.stats.rating > 0 ? { text: p.stats.rating.toFixed(2), known: true } : { text: "—", known: false };
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
            <th className="px-3 py-2 text-left">Rol</th>
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
                <td className="px-3 py-2"><RolePill role={p.role_deduced} /></td>
                <td className="px-2 py-2 text-right font-mono">{kda(p)}</td>
                <td className={cn("px-2 py-2 text-right font-mono", pm >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pm >= 0 ? "+" : ""}{pm}
                </td>
                <td className="px-2 py-2 text-right font-mono">{fmtAdr(p, totalRounds)}</td>
                {(() => { const k = fmtKast(p); return (
                  <td className={cn("px-2 py-2 text-right font-mono", !k.known && "text-muted-foreground", k.known && p.stats.kast < 60 && "text-red-400")}>{k.text}</td>
                ); })()}
                {(() => { const r = fmtRating(p); return (
                  <td className={cn("px-2 py-2 text-right font-mono", !r.known && "text-muted-foreground", r.known && p.stats.rating >= 1.0 && "text-emerald-400", r.known && p.stats.rating < 0.9 && "text-red-400")}>{r.text}</td>
                ); })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RolePill({ role }: { role: DeducedRole }) {
  if (!role) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", ROLE_COLORS[role] ?? "bg-muted text-muted-foreground border-border")}>
      {role}
    </span>
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
            <FullTeamTable label={demo.match.teams.team2.name} players={team2All} />
            <FullTeamTable label={demo.match.teams.team1.name} players={team1All} />
          </TabsContent>
          <TabsContent value="ct" className="mt-4 space-y-4">
            <SideBadgeNote demo={demo} side="CT" />
            <FullTeamTable label={`${demo.match.teams.team2.name} · CT (${demo.match.teams.team2.first_half_side === "CT" ? "1er tiempo" : "2do tiempo"})`} players={team2All} />
            <FullTeamTable label={`${demo.match.teams.team1.name} · CT (${demo.match.teams.team1.first_half_side === "CT" ? "1er tiempo" : "2do tiempo"})`} players={team1All} />
          </TabsContent>
          <TabsContent value="t" className="mt-4 space-y-4">
            <SideBadgeNote demo={demo} side="TERRORIST" />
            <FullTeamTable label={`${demo.match.teams.team2.name} · T (${demo.match.teams.team2.first_half_side === "TERRORIST" ? "1er tiempo" : "2do tiempo"})`} players={team2All} />
            <FullTeamTable label={`${demo.match.teams.team1.name} · T (${demo.match.teams.team1.first_half_side === "TERRORIST" ? "1er tiempo" : "2do tiempo"})`} players={team1All} />
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

function FullTeamTable({ label, players, totalRounds = 0 }: { label: string; players: DemoPlayer[]; totalRounds?: number }) {
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
              <th className="px-3 py-2 text-left">Rol</th>
              <th className="px-2 py-2 text-right">K/D/A</th>
              <th className="px-2 py-2 text-right">+/-</th>
              <th className="px-2 py-2 text-right">ADR</th>
              <th className="px-2 py-2 text-right">KAST%</th>
              <th className="px-2 py-2 text-right">Rating</th>
              <th className="px-2 py-2 text-right">HS</th>
              <th className="px-2 py-2 text-right">Damage</th>
              <th className="px-2 py-2 text-right">FK/FD</th>
              <th className="px-2 py-2 text-right">Clutch</th>
              <th className="px-2 py-2 text-right">Util Dmg</th>
              <th className="px-2 py-2 text-right">Flashes</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const pm = plusMinus(p);
              return (
                <tr key={p.steamid} className="border-t border-border/40">
                  <td className="px-3 py-2 flex items-center gap-2">
                    <Avatar className="h-5 w-5"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[8px]">{p.name[0]}</AvatarFallback></Avatar>
                    <span>{p.name}</span>
                  </td>
                  <td className="px-3 py-2"><RolePill role={p.role_deduced} /></td>
                  <td className="px-2 py-2 text-right font-mono">{kda(p)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono", pm >= 0 ? "text-emerald-400" : "text-red-400")}>{pm >= 0 ? "+" : ""}{pm}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.adr.toFixed(1)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono", p.stats.kast < 60 ? "text-red-400" : "")}>{p.stats.kast.toFixed(0)}%</td>
                  <td className={cn("px-2 py-2 text-right font-mono", p.stats.rating >= 1.0 ? "text-emerald-400" : p.stats.rating >= 0.9 ? "" : "text-red-400")}>{p.stats.rating.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.hs_kills}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.damage}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.first_kills}/{p.stats.first_deaths}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.clutches_won}/{p.stats.clutches_total}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.utility_damage}</td>
                  <td className="px-2 py-2 text-right font-mono">{p.stats.enemies_flashed}</td>
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
    rounds.forEach((r) => {
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
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {half1.map((r) => <RoundCell key={r.round_number} demo={demo} round={r} highlighted={matches.has(r.round_number)} dimmed={filtersActive && !matches.has(r.round_number)} />)}
        </div>
        <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border py-1">Half Time</div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
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

function RoundCell({ demo, round: r, highlighted, dimmed }: { demo: DemoData; round: DemoRound; highlighted?: boolean; dimmed?: boolean }) {
  const t1Won = team1WonRound(demo, r);
  const winnerLabel = t1Won ? demo.match.teams.team1.name : demo.match.teams.team2.name;
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BarChartCard title="Player Rating" subtitle="Performance rating" data={charts.player_rating} color="purple" />
        <BarChartCard title="Damage Per Round" subtitle="ADR" data={charts.damage_per_round} color="emerald" />
        <BarChartCard title="Total Damage" subtitle="Daño total" data={charts.total_damage} color="yellow" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ClutchCard data={charts.clutch} />
        <EntryCard data={charts.entry} />
      </div>
    </div>
  );
}

function BarChartCard({ title, subtitle, data, color }: { title: string; subtitle: string; data: { tag: string; value: number }[]; color: "purple" | "emerald" | "yellow" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colorMap = { purple: "bg-purple-500", emerald: "bg-emerald-500/60", yellow: "bg-yellow-500" };
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="text-xs font-heading font-bold text-accent">{title}</div>
      <div className="text-[10px] text-muted-foreground mb-3">{subtitle}</div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.tag} className="flex-1 flex flex-col items-center gap-1">
            <div className={cn("w-full rounded-t", colorMap[color])} style={{ height: `${(d.value / max) * 100}%` }} />
            <div className="text-[8px] text-muted-foreground rotate-45 origin-left translate-y-2 whitespace-nowrap">{d.tag}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClutchCard({ data }: { data: { tag: string; attempts: number; wins: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="border border-border/50 rounded-md p-3">
        <div className="text-xs font-heading font-bold text-accent flex items-center gap-1"><User className="h-3 w-3" /> Clutch Performance</div>
        <div className="text-[10px] text-muted-foreground py-6 text-center">Sin clutches registrados</div>
      </div>
    );
  }
  const maxAttempts = Math.max(...data.map((d) => d.attempts), 1);
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="text-xs font-heading font-bold text-accent flex items-center gap-1"><User className="h-3 w-3" /> Clutch Performance</div>
      <div className="text-[10px] text-muted-foreground mb-3">Intentos vs ganados</div>
      <div className="flex items-end gap-3 h-28">
        {data.map((d) => (
          <div key={d.tag} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full bg-orange-500 rounded-t" style={{ height: `${(d.attempts / maxAttempts) * 100}%` }} />
            <div className="text-[9px]">{d.tag}</div>
            <div className="text-[8px] text-muted-foreground">{d.wins}/{d.attempts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryCard({ data }: { data: { tag: string; fk: number; fd: number }[] }) {
  const max = Math.max(...data.flatMap((d) => [d.fk, d.fd]), 1);
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="text-xs font-heading font-bold text-accent">Entry Fragging</div>
      <div className="text-[10px] text-muted-foreground mb-3">Opening duels (FK vs FD)</div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.tag} className="flex-1 flex items-end gap-0.5">
            <div className="w-1/2 bg-emerald-500 rounded-t" style={{ height: `${(d.fk / max) * 100}%` }} title="FK" />
            <div className="w-1/2 bg-red-500 rounded-t" style={{ height: `${(d.fd / max) * 100}%` }} title="FD" />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-3 text-[9px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500" /> FK</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-red-500" /> FD</span>
      </div>
    </div>
  );
}
