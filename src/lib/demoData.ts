import type {
  DemoData, DemoRound, DemoPlayer, EndReason, BuyType, Side, DemoBuyTypeSummary,
} from "@/types/demo";
import { classifyBuyType } from "./demoLabels";

const BUY_TYPES: BuyType[] = ["full_eco", "eco", "half_buy", "full_buy", "pistol"];

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
  const raw = input as Record<string, any>;

  // Already v2
  if (raw.schema_version === 2 && raw.match && raw.rounds && raw.players) {
    return raw as DemoData;
  }

  // Best-effort migration of v1 (score_us / team_us / etc.)
  if (typeof raw.score_us !== "number" || !raw.team_us || !raw.team_them) return null;

  const startingSide: Side = raw.starting_side === "CT" ? "CT" : "TERRORIST";
  const secondHalfSide: Side = startingSide === "CT" ? "TERRORIST" : "CT";

  const team1Players: any[] = raw.team_us?.players ?? [];
  const team2Players: any[] = raw.team_them?.players ?? [];

  const totalRounds: number = raw.total_rounds ?? (raw.score_us + raw.score_them);

  const rounds: DemoRound[] = (raw.rounds ?? []).map((r: any): DemoRound => {
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
  const pushPlayer = (p: any, team: "team1" | "team2") => {
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
    team1: Object.fromEntries(BUY_TYPES.map((b) => [b, { wins: 0, losses: 0 }])) as any,
    team2: Object.fromEntries(BUY_TYPES.map((b) => [b, { wins: 0, losses: 0 }])) as any,
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
      map: raw.map,
      server: raw.server ?? "",
      date: raw.generated_at ?? new Date().toISOString(),
      match_type: raw.match_type ?? "OFFICIAL",
      total_rounds: totalRounds,
      score: { team1: raw.score_us, team2: raw.score_them },
      teams: {
        team1: { name: raw.team_us?.name ?? "Tactical Chaos", first_half_side: startingSide, player_steamids: team1Players.map((p) => p.steam_id) },
        team2: { name: raw.team_them?.name ?? raw.rival ?? "Rival", first_half_side: startingSide === "CT" ? "TERRORIST" : "CT", player_steamids: team2Players.map((p) => p.steam_id) },
      },
    },
    rounds,
    players,
    buy_type_summary: summary,
  };
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
