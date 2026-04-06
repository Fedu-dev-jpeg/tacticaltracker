export type MapName = "Nuke" | "Ancient" | "Anubis" | "Inferno";
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
  trPistol: WinLoss;
  trSecondRound: WinLoss;
  trFinalizacion: WinLoss;
  startingSide: Side;
  notes: string;
  recorded_by?: string;
}

export const MAPS: MapName[] = ["Nuke", "Ancient", "Anubis", "Inferno"];
export const MATCH_TYPES: MatchType[] = ["Treino", "Scrim", "Oficial"];
export const PLAYERS = ["Froud", "Fedu", "Hanzo", "Diuva", "Gyer", "Pank", "Ian"];
export const TOURNAMENT_DATE = new Date("2026-04-25T15:00:00");
