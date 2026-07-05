import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, User, Users, Bomb, Skull, Clock, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerBlob {
  tag: string;
  roles: string[];
  kills: number; deaths: number; assists: number;
  kda: string;
  plus_minus: number;
  adr: number;
  kast_pct: number;
  rating: number;
  impact: number;
  damage: number;
  entry_kd: string;
  trades: number;
  avatar_url?: string | null;
}
interface Round {
  n: number;
  winner: "us" | "them";
  winner_team_label: string;
  winner_side: "CT" | "TR";
  survivors: number;
  enemy_remaining: number;
  reason: string;
  is_pistol: boolean;
  us_side: "CT" | "TR";
  us_buy: string;
  them_buy: string;
}
export interface DemoData {
  map: string;
  rival: string;
  score_us: number;
  score_them: number;
  starting_side: "CT" | "TR";
  total_rounds: number;
  team_us: { name: string; score: number; players: PlayerBlob[] };
  team_them: { name: string; score: number; players: PlayerBlob[] };
  rounds: Round[];
  economy: { us: { wins: Record<string, number>; losses: Record<string, number> }; them: { wins: Record<string, number>; losses: Record<string, number> } };
  charts: {
    player_rating: { tag: string; value: number }[];
    damage_per_round: { tag: string; value: number }[];
    total_damage: { tag: string; value: number }[];
    clutch: { tag: string; attempts: number; wins: number }[];
    entry: { tag: string; fk: number; fd: number; trades: number }[];
  };
}

const ROLE_COLORS: Record<string, string> = {
  "A Anchor": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "A Extremity": "bg-red-500/20 text-red-400 border-red-500/40",
  "B Anchor": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "B Cave": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "B Extremity": "bg-red-500/20 text-red-400 border-red-500/40",
  "Awper": "bg-orange-500/20 text-orange-400 border-orange-500/40",
  "Mid": "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
};

export default function MatchStatsDialog({ data, trigger }: { data: DemoData; trigger?: React.ReactNode }) {
  const [full, setFull] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Stats
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={cn("bg-background border-border p-0", full ? "max-w-6xl max-h-[92vh] overflow-y-auto" : "max-w-3xl")}>
        {!full ? <MiniView data={data} onFull={() => setFull(true)} /> : <FullView data={data} onBack={() => setFull(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScoreHeader({ data }: { data: DemoData }) {
  return (
    <div className="flex items-center justify-center gap-6 py-4 border-y border-border">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">?</div>
        <span>Team 1</span>
      </div>
      <div className="font-heading text-3xl font-bold tabular-nums">
        {data.score_us} - {data.score_them}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Team 2</span>
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">?</div>
      </div>
    </div>
  );
}

function MiniView({ data, onFull }: { data: DemoData; onFull: () => void }) {
  return (
    <div className="p-5">
      <DialogHeader className="mb-3">
        <DialogTitle className="text-lg font-heading">Match Statistics</DialogTitle>
        <div className="text-xs text-muted-foreground">Player performance data</div>
      </DialogHeader>
      <div className="flex items-center justify-between gap-4 mb-3">
        <ScoreHeader data={data} />
        <Button variant="outline" size="sm" onClick={onFull}>View Full Stats</Button>
      </div>
      <MiniTeamTable label={data.team_them.name} players={data.team_them.players} />
      <MiniTeamTable label={data.team_us.name} players={data.team_us.players} className="mt-3" />
    </div>
  );
}

function MiniTeamTable({ label, players, className }: { label: string; players: PlayerBlob[]; className?: string }) {
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
            <th className="px-3 py-2 text-left">Roles</th>
            <th className="px-2 py-2 text-right">K/D/A</th>
            <th className="px-2 py-2 text-right">+/-</th>
            <th className="px-2 py-2 text-right">ADR</th>
            <th className="px-2 py-2 text-right">KAST</th>
            <th className="px-2 py-2 text-right">Rating</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} className="border-t border-border/40">
              <td className="px-3 py-2 flex items-center gap-2">
                <Avatar className="h-5 w-5"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[8px]">{p.tag[0]}</AvatarFallback></Avatar>
                <span>{p.tag}</span>
              </td>
              <td className="px-3 py-2"><RolePills roles={p.roles} /></td>
              <td className="px-2 py-2 text-right font-mono">{p.kda}</td>
              <td className={cn("px-2 py-2 text-right font-mono", p.plus_minus >= 0 ? "text-emerald-400" : "text-red-400")}>
                {p.plus_minus >= 0 ? "+" : ""}{p.plus_minus}
              </td>
              <td className="px-2 py-2 text-right font-mono">{p.adr}</td>
              <td className={cn("px-2 py-2 text-right font-mono", p.kast_pct < 60 ? "text-red-400" : "")}>{p.kast_pct}%</td>
              <td className={cn("px-2 py-2 text-right font-mono", p.rating >= 1.0 ? "text-emerald-400" : p.rating >= 0.9 ? "" : "text-red-400")}>{p.rating.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolePills({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className={cn("text-[9px] px-1.5 py-0.5 rounded border", ROLE_COLORS[r] ?? "bg-muted text-muted-foreground border-border")}>{r}</span>
      ))}
    </div>
  );
}

function FullView({ data, onBack }: { data: DemoData; onBack: () => void }) {
  return (
    <div className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <button onClick={onBack} className="hover:text-accent">Private Demos</button> <span className="mx-1">›</span> <span className="text-accent">Match Statistics</span>
        </div>
      </div>

      {/* Map header */}
      <div className="rounded-lg border border-border p-6 text-center space-y-3">
        <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Shield className="h-4 w-4 text-accent" /> {data.map}
        </div>
        <ScoreHeader data={data} />
      </div>

      {/* Detailed player stats */}
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
            <TabsTrigger value="both">Both Sides</TabsTrigger>
            <TabsTrigger value="ct">CT Side</TabsTrigger>
            <TabsTrigger value="t">T Side</TabsTrigger>
          </TabsList>
          <TabsContent value="both" className="mt-4 space-y-4">
            <FullTeamTable label={data.team_them.name} players={data.team_them.players} />
            <FullTeamTable label={data.team_us.name} players={data.team_us.players} />
          </TabsContent>
          <TabsContent value="ct" className="mt-4 text-xs text-muted-foreground text-center py-6">
            Split por side estará disponible cuando el parser real esté conectado.
          </TabsContent>
          <TabsContent value="t" className="mt-4 text-xs text-muted-foreground text-center py-6">
            Split por side estará disponible cuando el parser real esté conectado.
          </TabsContent>
        </Tabs>
      </div>

      {/* Round Analysis */}
      <RoundsTimeline rounds={data.rounds} />

      {/* Charts */}
      <PerformanceCharts data={data} />
    </div>
  );
}

function FullTeamTable({ label, players }: { label: string; players: PlayerBlob[] }) {
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
              <th className="px-3 py-2 text-left">Roles</th>
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
            {players.map((p, i) => (
              <tr key={i} className="border-t border-border/40">
                <td className="px-3 py-2 flex items-center gap-2">
                  <Avatar className="h-5 w-5"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[8px]">{p.tag[0]}</AvatarFallback></Avatar>
                  <span>{p.tag}</span>
                </td>
                <td className="px-3 py-2"><RolePills roles={p.roles} /></td>
                <td className="px-2 py-2 text-right font-mono">{p.kda}</td>
                <td className={cn("px-2 py-2 text-right font-mono", p.plus_minus >= 0 ? "text-emerald-400" : "text-red-400")}>{p.plus_minus >= 0 ? "+" : ""}{p.plus_minus}</td>
                <td className="px-2 py-2 text-right font-mono">{p.adr}</td>
                <td className={cn("px-2 py-2 text-right font-mono", p.kast_pct < 60 ? "text-red-400" : "")}>{p.kast_pct}%</td>
                <td className={cn("px-2 py-2 text-right font-mono", p.rating >= 1.0 ? "text-emerald-400" : p.rating >= 0.9 ? "" : "text-red-400")}>{p.rating.toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono">{p.impact.toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono">{p.damage}</td>
                <td className="px-2 py-2 text-right font-mono">{p.entry_kd}</td>
                <td className="px-2 py-2 text-right font-mono">{p.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoundsTimeline({ rounds }: { rounds: Round[] }) {
  const half1 = rounds.slice(0, 12);
  const half2 = rounds.slice(12);
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-center">
        <h3 className="font-heading font-bold">Round Analysis</h3>
        <p className="text-xs text-muted-foreground">Round by round breakdown with winners, survivors, and round reasons</p>
      </div>
      <div className="rounded-md border border-border/40 p-3 space-y-3">
        <div className="text-xs font-heading font-bold flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-accent" /> Rounds Timeline
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {half1.map((r) => <RoundCell key={r.n} round={r} />)}
        </div>
        <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border py-1">Half Time</div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {half2.map((r) => <RoundCell key={r.n} round={r} />)}
        </div>
        <TimelineLegend />
      </div>
    </div>
  );
}

function RoundCell({ round: r }: { round: Round }) {
  const winnerLabel = r.winner === "us" ? "Team 1" : "Team 2";
  return (
    <div className="border border-border/50 rounded p-1.5 text-center text-[9px] space-y-0.5 bg-muted/10">
      <div className="text-muted-foreground">R{r.n}</div>
      <div className={cn("rounded-sm px-1 font-heading text-[10px]", r.winner_side === "CT" ? "bg-blue-500/30 text-blue-300" : "bg-orange-500/30 text-orange-300")}>{r.winner_side}</div>
      <div className="font-medium">{winnerLabel}</div>
      <div className="flex items-center justify-center gap-1 text-[8px]">
        {r.reason === "Bomb" && <Bomb className="h-2.5 w-2.5 text-red-400" />}
        {r.reason === "Elimination" && <Skull className="h-2.5 w-2.5" />}
        {r.reason === "Time" && <Clock className="h-2.5 w-2.5" />}
      </div>
      <div className="text-[8px] text-muted-foreground">{r.survivors} · {r.enemy_remaining}</div>
      <div className="flex justify-center gap-0.5">
        <BuyPill t={r.us_buy} /> <BuyPill t={r.them_buy} />
      </div>
    </div>
  );
}
function BuyPill({ t }: { t: string }) {
  const colors: Record<string, string> = { P: "bg-yellow-500/30 text-yellow-300", FE: "bg-red-500/30 text-red-300", E: "bg-orange-500/30 text-orange-300", HB: "bg-blue-500/30 text-blue-300", FB: "bg-emerald-500/30 text-emerald-300" };
  return <span className={cn("text-[8px] rounded px-1 font-mono", colors[t] ?? "bg-muted")}>{t}</span>;
}
function TimelineLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-3 text-[9px] text-muted-foreground border-t border-border pt-2">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> CT Winner</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> T Winner</span>
      <span className="flex items-center gap-1"><Bomb className="h-2.5 w-2.5 text-red-400" /> Bomb</span>
      <span className="flex items-center gap-1"><Skull className="h-2.5 w-2.5" /> Elim</span>
      <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Time</span>
      <span className="flex items-center gap-1">Buys:</span>
      <BuyPill t="P" /> Pistol <BuyPill t="FE" /> Full Eco <BuyPill t="E" /> Eco <BuyPill t="HB" /> Half Buy <BuyPill t="FB" /> Full Buy
    </div>
  );
}

function PerformanceCharts({ data }: { data: DemoData }) {
  const c = data.charts;
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="text-center">
        <h3 className="font-heading font-bold">Performance Charts</h3>
        <p className="text-xs text-muted-foreground">Visual analysis of player performance metrics</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BarChartCard title="Player Rating" subtitle="Performance rating across players" data={c.player_rating} color="purple" />
        <BarChartCard title="Damage Per Round" subtitle="Average damage dealt per round" data={c.damage_per_round} color="emerald" />
        <BarChartCard title="Total Damage" subtitle="Total damage dealt by each player" data={c.total_damage} color="yellow" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ClutchCard data={c.clutch} />
        <EntryCard data={c.entry} />
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
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="text-xs font-heading font-bold text-accent flex items-center gap-1"><User className="h-3 w-3" /> Clutch Performance</div>
      <div className="text-[10px] text-muted-foreground mb-3">Clutch attempts vs successful wins</div>
      <div className="flex items-end gap-3 h-28">
        {data.map((d) => (
          <div key={d.tag} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full bg-orange-500 rounded-t" style={{ height: `${(d.attempts / 5) * 100}%` }} />
            <div className="text-[9px]">{d.tag}</div>
            <div className="text-[8px] text-muted-foreground">{d.wins}/{d.attempts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryCard({ data }: { data: { tag: string; fk: number; fd: number; trades: number }[] }) {
  const max = Math.max(...data.flatMap((d) => [d.fk, d.fd, d.trades]), 1);
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="text-xs font-heading font-bold text-accent">Entry Fragging & Trading</div>
      <div className="text-[10px] text-muted-foreground mb-3">Opening duels and trade performance</div>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.tag} className="flex-1 flex items-end gap-0.5">
            <div className="w-1/3 bg-emerald-500 rounded-t" style={{ height: `${(d.fk / max) * 100}%` }} title="FK" />
            <div className="w-1/3 bg-red-500 rounded-t" style={{ height: `${(d.fd / max) * 100}%` }} title="FD" />
            <div className="w-1/3 bg-purple-500 rounded-t" style={{ height: `${(d.trades / max) * 100}%` }} title="Trades" />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-3 text-[9px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500" /> FK</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-red-500" /> FD</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-purple-500" /> Trades</span>
      </div>
    </div>
  );
}
