import type { EndReason, Side, BuyType } from "@/types/demo";

export const END_REASON_LABEL: Record<EndReason, string> = {
  target_bombed: "Bomba explotó",
  bomb_defused: "Bomba desactivada",
  ct_elimination: "CT eliminados",
  t_elimination: "T eliminados",
  round_time_expired: "Tiempo agotado",
};

export const SIDE_LABEL: Record<Side, string> = {
  CT: "Counter-Terrorist",
  TERRORIST: "Terrorist",
};

export const SIDE_SHORT: Record<Side, string> = {
  CT: "CT",
  TERRORIST: "T",
};

export const BUY_LABEL: Record<BuyType, string> = {
  full_eco: "Full Eco",
  eco: "Eco",
  half_buy: "Half Buy",
  full_buy: "Full Buy",
  pistol: "Pistola",
};

export const BUY_SHORT: Record<BuyType, string> = {
  full_eco: "F.Eco",
  eco: "Eco",
  half_buy: "Half",
  full_buy: "Full",
  pistol: "Pistol",
};

export function opposite(side: Side): Side {
  return side === "CT" ? "TERRORIST" : "CT";
}

/** Rangos calibrados de avg_equip → buy_type. Ronda 1 y 13 son siempre pistol. */
export function classifyBuyType(avgEquip: number, roundNumber: number): BuyType {
  if (roundNumber === 1 || roundNumber === 13) return "pistol";
  if (avgEquip < 1000) return "full_eco";
  if (avgEquip < 2500) return "eco";
  if (avgEquip < 4000) return "half_buy";
  return "full_buy";
}
