import type {
  DemoData, DemoRound, DemoPlayer, EndReason, BuyType, Side, DemoBuyTypeSummary,
} from "@/types/demo";
import { classifyBuyType } from "./demoLabels";

const BUY_TYPES: BuyType[] = ["full_eco", "eco", "half_buy", "full_buy", "pistol"];
const TACTICAL_CHAOS = "Tactical Chaos";
const TACTICAL_CHAOS_STEAM_IDS = new Set([
  "76561198847083529",
  "76561198354921400",
  "76561199104616493",
  "76561198894980148",
  "76561199536800035",
]);

const LEGACY_BUY_MAP: Record<string, BuyType> = {
  P: "pistol",
  FE: "full_eco",
  E: "eco",
  HB: "half_buy",
  FB: "full_buy",
};

const LEGACY_REASON_MAP: Record<string, EndReason> = {
  Bomb: "target_bombed",
  Defuse: "bomb_defused",
  Elimination: "ct_elimination", // best-effort; refined below with winner_side
  Time: "round_time_expired",
};

/** Wraps any legacy demo_data blob so the v2 renderer/exporter can consume it. */
export function migrateLegacyDemoData(input: unknown): DemoData | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  // Already v2
  if (raw.schema_version === 2 && raw.match && raw.rounds && raw.players) {
    return normalizeDemoDataV2(raw as unknown as DemoData);
  }

  // Best-effort migration of v1 (score_us / team_us / etc.)
  if (typeof raw.score_us !== "number" || !raw.team_us || !raw.team_them) return null;

  const startingSide: Side = raw.starting_side === "CT" ? "CT" : "TERRORIST";
  const secondHalfSide: Side = startingSide === "CT" ? "TERRORIST" : "CT";

  const rawTeamUs = raw.team_us as { players?: LegacyPlayer[]; name?: string } | undefined;
  const rawTeamThem = raw.team_them as { players?: LegacyPlayer[]; name?: string } | undefined;
  const team1Players: LegacyPlayer[] = rawTeamUs?.players ?? [];
  const team2Players: LegacyPlayer[] = rawTeamThem?.players ?? [];

  const totalRounds: number = (raw.total_rounds as number | undefined) ?? ((raw.score_us as number) + (raw.score_them as number));

  const rounds: DemoRound[] = ((raw.rounds as LegacyRound[] | undefined) ?? []).map((r): DemoRound => {
    const winnerFromUs = r.winner === "us";
    const usSideThisRound: Side = (r.n <= 12 ? startingSide : secondHalfSide);
    const themSide: Side = usSideThisRound === "CT" ? "TERRORIST" : "CT";
    const winnerSide: Side = winnerFromUs ? usSideThisRound : themSide;

    let end_reason: EndReason = LEGACY_REASON_MAP[r.reason] ?? "round_time_expired";
    if (end_reason === "ct_elimination") {
      end_reason = winnerSide === "CT" ? "t_elimination" : "ct_elimination";
    }

    const buy1: BuyType = LEGACY_BUY_MAP[r.us_buy] ?? "eco";
    const buy2: BuyType = LEGACY_BUY_MAP[r.them_buy] ?? "eco";

    return {
      round_number: r.n,
      is_pistol: !!r.is_pistol,
      winner_side: winnerSide,
      end_reason,
      clutch: (winnerFromUs && r.survivors === 1 && r.enemy_remaining >= 1)
        ? { player_steamid: team1Players[0]?.steam_id ?? "unknown", vs: Math.max(1, Math.min(4, r.enemy_remaining)) as 1|2|3|4, won: true }
        : null,
      bomb: end_reason === "target_bombed" || end_reason === "bomb_defused"
        ? { planted: true, site: null, planter_steamid: null, tick: null, defused: end_reason === "bomb_defused", defuser_steamid: null }
        : null,
      buy_types: { team1: buy1, team2: buy2 },
      kills: [],
      economy: {
        team1: { avg_equip: 0, avg_balance: 0, buy_type: buy1 },
        team2: { avg_equip: 0, avg_balance: 0, buy_type: buy2 },
      },
    };
  });

  const players: Record<string, DemoPlayer> = {};
  const pushPlayer = (p: LegacyPlayer, team: "team1" | "team2") => {
    const sid = p.steam_id ?? `${team}-${p.tag}`;
    players[sid] = {
      steamid: sid,
      name: p.tag,
      team,
      role_deduced: null,
      avatar_url: p.avatar_url ?? null,
      stats: {
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        hs_kills: Math.round(p.kills * ((p.hs_pct ?? 0) / 100)),
        damage: p.damage ?? Math.round((p.adr ?? 0) * totalRounds),
        adr: p.adr ?? 0,
        kast: p.kast_pct ?? 0,
        rating: p.rating ?? 1,
        first_kills: Number(String(p.entry_kd ?? "0/0").split("/")[0]) || 0,
        first_deaths: Number(String(p.entry_kd ?? "0/0").split("/")[1]) || 0,
        clutches_won: 0, clutches_total: 0,
        utility_damage: 0, enemies_flashed: 0,
        mvps: 0,
      },
      per_round: [],
    };
  };
  team1Players.forEach((p) => pushPlayer(p, "team1"));
  team2Players.forEach((p) => pushPlayer(p, "team2"));

  const summary: DemoBuyTypeSummary = {
    team1: emptyBuyStats(),
    team2: emptyBuyStats(),
  };
  for (const r of rounds) {
    const team1Won = (r.winner_side === startingSide) === (r.round_number <= 12);
    const w1 = team1Won ? "wins" : "losses";
    const w2 = team1Won ? "losses" : "wins";
    summary.team1[r.buy_types.team1][w1] += 1;
    summary.team2[r.buy_types.team2][w2] += 1;
  }

  return {
    schema_version: 2,
    match: {
      map: raw.map as string,
      server: (raw.server as string | undefined) ?? "",
      date: (raw.generated_at as string | undefined) ?? new Date().toISOString(),
      match_type: (raw.match_type as "OFFICIAL" | "TRAINING" | undefined) ?? "OFFICIAL",
      total_rounds: totalRounds,
      score: { team1: raw.score_us as number, team2: raw.score_them as number },
      teams: {
        team1: { name: rawTeamUs?.name ?? "Nosotros", first_half_side: startingSide, player_steamids: team1Players.map((p) => p.steam_id) },
        team2: { name: rawTeamThem?.name ?? String(raw.rival ?? "Rival"), first_half_side: startingSide === "CT" ? "TERRORIST" : "CT", player_steamids: team2Players.map((p) => p.steam_id) },
      },
    },
    rounds,
    players,
    buy_type_summary: summary,
  };
}

interface LegacyPlayer {
  steam_id?: string;
  tag?: string;
  avatar_url?: string | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  hs_pct?: number;
  damage?: number;
  adr?: number;
  kast_pct?: number;
  rating?: number;
  entry_kd?: string;
}

interface LegacyRound {
  n: number;
  winner?: string;
  reason?: string;
  is_pistol?: boolean;
  survivors?: number;
  enemy_remaining?: number;
  us_buy?: string;
  them_buy?: string;
}

function emptyBuyStats(): Record<BuyType, { wins: number; losses: number }> {
  return Object.fromEntries(BUY_TYPES.map((b) => [b, { wins: 0, losses: 0 }])) as Record<BuyType, { wins: number; losses: number }>;
}

function normalizeDemoDataV2(input: DemoData): DemoData {
  const demo: DemoData = {
    ...input,
    match: {
      ...input.match,
      score: { ...input.match.score },
      teams: {
        team1: { ...input.match.teams.team1, player_steamids: [...input.match.teams.team1.player_steamids] },
        team2: { ...input.match.teams.team2, player_steamids: [...input.match.teams.team2.player_steamids] },
      },
    },
    rounds: [...input.rounds],
    players: Object.fromEntries(Object.entries(input.players).map(([steamid, player]) => [
      steamid,
      { ...player, stats: { ...player.stats }, per_round: [...player.per_round] },
    ])),
    buy_type_summary: {
      team1: { ...input.buy_type_summary.team1 },
      team2: { ...input.buy_type_summary.team2 },
    },
  };

  normalizeTacticalChaosName(demo);
  normalizeRounds(demo);
  reconcileStatsFromRounds(demo);
  reconcileDerivedPlayerMetrics(demo);
  demo.buy_type_summary = rebuildBuySummary(demo);
  return demo;
}

function normalizeTacticalChaosName(demo: DemoData) {
  for (const team of ["team1", "team2"] as const) {
    const ids = new Set([
      ...demo.match.teams[team].player_steamids.map(String),
      ...Object.values(demo.players).filter((p) => p.team === team).map((p) => p.steamid),
    ]);
    const isOurTeam = [...ids].some((sid) => TACTICAL_CHAOS_STEAM_IDS.has(sid));
    if (isOurTeam || /^hambrientos$/i.test(demo.match.teams[team].name ?? "")) {
      demo.match.teams[team].name = TACTICAL_CHAOS;
    }
  }
}

function normalizeRounds(demo: DemoData) {
  const scoreTotal = demo.match.score.team1 + demo.match.score.team2;
  const expectedTotal = scoreTotal >= 13 && scoreTotal <= 30 ? scoreTotal : demo.match.total_rounds;
  const seen = new Set<number>();
  demo.rounds = demo.rounds
    .filter((r) => r.round_number > 0 && r.round_number <= expectedTotal)
    .filter((r) => {
      if (seen.has(r.round_number)) return false;
      seen.add(r.round_number);
      return true;
    })
    .sort((a, b) => a.round_number - b.round_number)
    .map((r) => {
      const buy1 = r.is_pistol ? "pistol" : r.buy_types?.team1 ?? classifyBuyType(r.economy?.team1?.avg_equip ?? 0, r.round_number);
      const buy2 = r.is_pistol ? "pistol" : r.buy_types?.team2 ?? classifyBuyType(r.economy?.team2?.avg_equip ?? 0, r.round_number);
      return {
        ...r,
        is_pistol: r.round_number === 1 || r.round_number === 13 || r.is_pistol,
        buy_types: { team1: buy1, team2: buy2 },
        economy: {
          team1: { avg_equip: r.economy?.team1?.avg_equip ?? 0, avg_balance: r.economy?.team1?.avg_balance ?? 0, buy_type: buy1 },
          team2: { avg_equip: r.economy?.team2?.avg_equip ?? 0, avg_balance: r.economy?.team2?.avg_balance ?? 0, buy_type: buy2 },
        },
        kills: r.kills.filter((k) => k.attacker || k.victim),
      };
    });
  demo.match.total_rounds = expectedTotal;
}

function reconcileStatsFromRounds(demo: DemoData) {
  const fromRounds = new Map<string, { kills: number; deaths: number; assists: number; first_kills: number; first_deaths: number }>();
  const ensure = (sid: string) => {
    const current = fromRounds.get(sid) ?? { kills: 0, deaths: 0, assists: 0, first_kills: 0, first_deaths: 0 };
    fromRounds.set(sid, current);
    return current;
  };

  for (const round of demo.rounds) {
    for (const kill of round.kills) {
      if (kill.attacker && demo.players[kill.attacker] && kill.attacker !== kill.victim) {
        const stats = ensure(kill.attacker);
        stats.kills += 1;
        if (kill.is_opening) stats.first_kills += 1;
      }
      if (kill.victim && demo.players[kill.victim]) {
        const stats = ensure(kill.victim);
        stats.deaths += 1;
        if (kill.is_opening) stats.first_deaths += 1;
      }
      if (kill.assister && demo.players[kill.assister] && kill.assister !== kill.attacker && kill.assister !== kill.victim) {
        ensure(kill.assister).assists += 1;
      }
    }
  }

  for (const [sid, calculated] of fromRounds) {
    const player = demo.players[sid];
    if (!player) continue;
    if (calculated.kills > player.stats.kills) player.stats.kills = calculated.kills;
    if (calculated.deaths > player.stats.deaths) player.stats.deaths = calculated.deaths;
    if (calculated.assists > player.stats.assists) player.stats.assists = calculated.assists;
    if (calculated.first_kills > player.stats.first_kills) player.stats.first_kills = calculated.first_kills;
    if (calculated.first_deaths > player.stats.first_deaths) player.stats.first_deaths = calculated.first_deaths;
  }
}

function reconcileDerivedPlayerMetrics(demo: DemoData) {
  const totalRounds = Math.max(1, demo.match.total_rounds);
  const kastFlags = new Map<string, Array<{ kill: boolean; assist: boolean; died: boolean }>>();
  for (const player of Object.values(demo.players)) {
    kastFlags.set(player.steamid, Array.from({ length: totalRounds }, () => ({ kill: false, assist: false, died: false })));
  }
  for (const round of demo.rounds) {
    const index = round.round_number - 1;
    if (index < 0 || index >= totalRounds) continue;
    for (const kill of round.kills) {
      const attacker = kastFlags.get(kill.attacker)?.[index];
      if (attacker) attacker.kill = true;
      const assister = kill.assister ? kastFlags.get(kill.assister)?.[index] : null;
      if (assister) assister.assist = true;
      const victim = kastFlags.get(kill.victim)?.[index];
      if (victim) victim.died = true;
    }
  }
  for (const player of Object.values(demo.players)) {
    if (player.stats.damage > 0) player.stats.adr = +(player.stats.damage / totalRounds).toFixed(1);
    const flags = kastFlags.get(player.steamid) ?? [];
    const kastRounds = flags.filter((f) => f.kill || f.assist || !f.died).length;
    if (flags.length > 0 && (player.stats.kast == null || player.stats.kast === 0)) {
      player.stats.kast = +((kastRounds / totalRounds) * 100).toFixed(1);
    }
    if (player.stats.rating == null || player.stats.rating === 0) {
      const kpr = player.stats.kills / totalRounds;
      const apr = player.stats.assists / totalRounds;
      const dpr = player.stats.deaths / totalRounds;
      const adr = player.stats.adr || player.stats.damage / totalRounds;
      const impact = 2.13 * kpr + 0.42 * apr - 0.41;
      player.stats.rating = +(((kpr / 0.679) + ((1 - dpr) / 0.317) + (impact / 1.277) + (adr / 79)) / 4).toFixed(2);
    }
  }
}

function rebuildBuySummary(demo: DemoData): DemoBuyTypeSummary {
  const summary: DemoBuyTypeSummary = { team1: emptyBuyStats(), team2: emptyBuyStats() };
  for (const round of demo.rounds) {
    const winner = team1WonRound(demo, round) ? "team1" : "team2";
    for (const team of ["team1", "team2"] as const) {
      const bucket = summary[team][round.buy_types[team]];
      if (team === winner) bucket.wins += 1;
      else bucket.losses += 1;
    }
  }
  return summary;
}

/** Returns whether team1 won a given round. */
export function team1WonRound(demo: DemoData, r: DemoRound): boolean {
  const firstHalf = r.round_number <= 12;
  const team1Side: Side = firstHalf
    ? demo.match.teams.team1.first_half_side
    : (demo.match.teams.team1.first_half_side === "CT" ? "TERRORIST" : "CT");
  return r.winner_side === team1Side;
}

/** Side a team is playing on a given round. */
export function teamSide(demo: DemoData, team: "team1" | "team2", roundNumber: number): Side {
  const base = demo.match.teams[team].first_half_side;
  const firstHalf = roundNumber <= 12;
  return firstHalf ? base : (base === "CT" ? "TERRORIST" : "CT");
}

export { classifyBuyType };
