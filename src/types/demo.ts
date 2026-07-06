// Canonical demo_data schema v2 — engine enums so the real WASM parser drops in 1:1.

export type Side = "CT" | "TERRORIST";
export type EndReason =
  | "target_bombed"
  | "bomb_defused"
  | "ct_elimination"
  | "t_elimination"
  | "round_time_expired";
export type BuyType = "full_eco" | "eco" | "half_buy" | "full_buy" | "pistol";
export type DeducedRole = "AWPer" | "Entry" | "Lurker" | "Support" | null;

export interface DemoKill {
  attacker: string; // steamid
  victim: string;
  assister: string | null;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  distance: number;
  is_opening: boolean;
  tick: number;
}

export interface DemoBomb {
  planted: boolean;
  site: "A" | "B" | null;
  planter_steamid: string | null;
  tick: number | null;
  defused: boolean;
  defuser_steamid: string | null;
}

export interface DemoClutch {
  player_steamid: string;
  vs: 1 | 2 | 3 | 4;
  won: boolean;
}

export interface DemoEconomySide {
  avg_equip: number;
  avg_balance: number;
  buy_type: BuyType;
}

export interface DemoRound {
  round_number: number;
  is_pistol: boolean;
  winner_side: Side;
  end_reason: EndReason;
  clutch: DemoClutch | null;
  bomb: DemoBomb | null;
  buy_types: { team1: BuyType; team2: BuyType };
  kills: DemoKill[];
  economy: { team1: DemoEconomySide; team2: DemoEconomySide };
}

export interface DemoPlayerStats {
  kills: number; deaths: number; assists: number;
  hs_kills: number; damage: number; adr: number;
  kast: number | null; rating: number | null;
  first_kills: number; first_deaths: number;
  clutches_won: number; clutches_total: number;
  utility_damage: number; enemies_flashed: number;
  mvps: number;
}

export interface DemoPlayer {
  steamid: string;
  name: string;
  team: "team1" | "team2";
  role_deduced: DeducedRole;
  stats: DemoPlayerStats;
  per_round: Array<{ round: number; kills: number; deaths: number; damage: number }>;
  avatar_url?: string | null;
}

export interface DemoBuyTypeSummary {
  team1: Record<BuyType, { wins: number; losses: number }>;
  team2: Record<BuyType, { wins: number; losses: number }>;
}

export interface DemoMatch {
  map: string;
  server: string;
  date: string; // ISO
  match_type: "OFFICIAL" | "TRAINING";
  total_rounds: number;
  score: { team1: number; team2: number };
  teams: {
    team1: { name: string; first_half_side: Side; player_steamids: string[] };
    team2: { name: string; first_half_side: Side; player_steamids: string[] };
  };
}

export interface DemoData {
  schema_version: 2;
  match: DemoMatch;
  rounds: DemoRound[];
  players: Record<string, DemoPlayer>;
  buy_type_summary: DemoBuyTypeSummary;
}

export type { DemoData as DemoAnalysis };
