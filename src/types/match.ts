export type MapName = "Mirage" | "Inferno" | "Nuke" | "Ancient" | "Anubis" | "Cache";
export type MatchType = "Treino" | "Scrim" | "Oficial";
export type Side = "CT" | "TR";
export type WinLoss = "WIN" | "LOSS";

export interface Match {
  id: string;
  date: string; // ISO string
  type: MatchType;
  map: MapName;
  rival: string;
  scoreUs: number;
  scoreThem: number;
  ctPistol: WinLoss;
  ctSecondRound: WinLoss;
  ctSetup: WinLoss;
  ctFinalizacion: WinLoss;
  trPistol: WinLoss;
  trSecondRound: WinLoss;
  trSetup: WinLoss;
  trFinalizacion: WinLoss;
  startingSide: Side;
  notes: string;
  recorded_by?: string;
  demo_data?: unknown | null;
  tournamentId?: string | null;
  tournamentName?: string | null;
}

export const MAPS: MapName[] = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Cache"];
export const MATCH_TYPES: MatchType[] = ["Treino", "Scrim", "Oficial"];
export const PLAYERS = ["Boke", "Kud", "Koda", "Ray", "Fedu"];
export const TOURNAMENT_DATE = new Date("2026-04-25T15:00:00");
