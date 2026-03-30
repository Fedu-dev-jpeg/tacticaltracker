import { useState, useEffect, useCallback } from "react";
import { Match, MapName } from "@/types/match";

const STORAGE_KEY = "hambrientos_matches";

function loadMatches(): Match[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveMatches(matches: Match[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}

export function useMatches() {
  const [matches, setMatches] = useState<Match[]>(loadMatches);

  useEffect(() => {
    saveMatches(matches);
  }, [matches]);

  const addMatch = useCallback((match: Omit<Match, "id">) => {
    const newMatch: Match = { ...match, id: crypto.randomUUID() };
    setMatches((prev) => [newMatch, ...prev]);
  }, []);

  const updateMatch = useCallback((id: string, data: Partial<Match>) => {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
  }, []);

  const deleteMatch = useCallback((id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const importData = useCallback((data: Match[]) => {
    setMatches(data);
  }, []);

  const exportData = useCallback(() => {
    return JSON.stringify(matches, null, 2);
  }, [matches]);

  const getMapMatches = useCallback(
    (map: MapName) => matches.filter((m) => m.map === map),
    [matches]
  );

  return { matches, addMatch, updateMatch, deleteMatch, importData, exportData, getMapMatches };
}

// Stats helpers
export function isWin(m: Match) {
  return m.scoreUs > m.scoreThem;
}

export function getWinRate(matches: Match[]) {
  if (!matches.length) return 0;
  return Math.round((matches.filter(isWin).length / matches.length) * 100);
}

export function getStreak(matches: Match[]): { type: "W" | "L"; count: number } {
  if (!matches.length) return { type: "W", count: 0 };
  const sorted = [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const firstResult = isWin(sorted[0]) ? "W" : "L";
  let count = 0;
  for (const m of sorted) {
    if ((isWin(m) ? "W" : "L") === firstResult) count++;
    else break;
  }
  return { type: firstResult, count };
}

export function getPistolRate(matches: Match[], side: "CT" | "TR") {
  if (!matches.length) return 0;
  const wins = matches.filter((m) => (side === "CT" ? m.ctPistol : m.trPistol) === "WIN").length;
  return Math.round((wins / matches.length) * 100);
}

export function getConversionRate(matches: Match[], side: "CT" | "TR") {
  if (!matches.length) return 0;
  const wins = matches.filter((m) => (side === "CT" ? m.ctSecondRound : m.trSecondRound) === "WIN").length;
  return Math.round((wins / matches.length) * 100);
}
