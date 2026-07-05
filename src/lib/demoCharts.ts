import type { DemoData } from "@/types/demo";

export interface ChartsData {
  player_rating: { tag: string; steamid: string; value: number }[];
  damage_per_round: { tag: string; steamid: string; value: number }[];
  total_damage: { tag: string; steamid: string; value: number }[];
  clutch: { tag: string; steamid: string; attempts: number; wins: number }[];
  entry: { tag: string; steamid: string; fk: number; fd: number }[];
}

/** Derives charts on the fly from persistent v2 data — never persisted in demo_data. */
export function buildChartData(demo: DemoData): ChartsData {
  const players = Object.values(demo.players);
  const totalRounds = demo.match.total_rounds || 1;

  const player_rating = players
    .map((p) => ({ tag: p.name, steamid: p.steamid, value: +p.stats.rating.toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  const damage_per_round = players
    .map((p) => ({ tag: p.name, steamid: p.steamid, value: +(p.stats.damage / totalRounds).toFixed(1) }))
    .sort((a, b) => b.value - a.value);

  const total_damage = players
    .map((p) => ({ tag: p.name, steamid: p.steamid, value: p.stats.damage }))
    .sort((a, b) => b.value - a.value);

  const clutch = players
    .filter((p) => p.stats.clutches_total > 0)
    .map((p) => ({ tag: p.name, steamid: p.steamid, attempts: p.stats.clutches_total, wins: p.stats.clutches_won }));

  const entry = players
    .map((p) => ({ tag: p.name, steamid: p.steamid, fk: p.stats.first_kills, fd: p.stats.first_deaths }))
    .sort((a, b) => (b.fk - b.fd) - (a.fk - a.fd));

  return { player_rating, damage_per_round, total_damage, clutch, entry };
}
