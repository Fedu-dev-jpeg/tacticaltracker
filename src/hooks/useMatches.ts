import { useState, useEffect, useCallback } from "react";
import { Match, MapName } from "@/types/match";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];

export function useMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("*, tournaments(name)")
      .eq("confirmed", true)
      .order("date", { ascending: false });
    if (!error && data) {
      setMatches(data.map(dbToMatch));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      fetchMatches();
    } else {
      setMatches([]);
      setLoading(false);
    }
  }, [user, fetchMatches]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`matches-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        fetchMatches();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMatches, user]);

  const addMatch = useCallback(async (match: Omit<Match, "id">) => {
    const playerName = user?.user_metadata?.player_name || user?.email?.split("@")[0] || "Desconocido";
    const row = matchToDb({ ...match, recorded_by: playerName });
    await supabase.from("matches").insert(row);
    fetchMatches();
  }, [user, fetchMatches]);

  const updateMatch = useCallback(async (id: string, data: Partial<Match>) => {
    const updates: MatchUpdate = {};
    if (data.date !== undefined) updates.date = data.date;
    if (data.type !== undefined) updates.type = data.type;
    if (data.map !== undefined) updates.map = data.map;
    if (data.rival !== undefined) updates.rival = data.rival;
    if (data.scoreUs !== undefined) updates.score_us = data.scoreUs;
    if (data.scoreThem !== undefined) updates.score_them = data.scoreThem;
    if (data.ctPistol !== undefined) updates.ct_pistol = data.ctPistol;
    if (data.ctSecondRound !== undefined) updates.ct_second_round = data.ctSecondRound;
    if (data.ctSetup !== undefined) updates.ct_setup = data.ctSetup;
    if (data.ctFinalizacion !== undefined) updates.ct_finalizacion = data.ctFinalizacion;
    if (data.trPistol !== undefined) updates.tr_pistol = data.trPistol;
    if (data.trSecondRound !== undefined) updates.tr_second_round = data.trSecondRound;
    if (data.trSetup !== undefined) updates.tr_setup = data.trSetup;
    if (data.trFinalizacion !== undefined) updates.tr_finalizacion = data.trFinalizacion;
    if (data.startingSide !== undefined) updates.starting_side = data.startingSide;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.tournamentId !== undefined) updates.tournament_id = data.tournamentId;
    await supabase.from("matches").update(updates).eq("id", id);
    fetchMatches();
  }, [fetchMatches]);

  const deleteMatch = useCallback(async (id: string) => {
    await supabase.from("matches").delete().eq("id", id);
    fetchMatches();
  }, [fetchMatches]);

  const importData = useCallback(async (data: Match[]) => {
    const rows = data.map((m) => matchToDb(m));
    await supabase.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (rows.length > 0) await supabase.from("matches").insert(rows);
    fetchMatches();
  }, [fetchMatches]);

  const exportData = useCallback(() => {
    return JSON.stringify(matches, null, 2);
  }, [matches]);

  const getMapMatches = useCallback(
    (map: MapName) => matches.filter((m) => m.map === map),
    [matches]
  );

  return { matches, addMatch, updateMatch, deleteMatch, importData, exportData, getMapMatches, loading };
}

function dbToMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    date: row.date as string,
    type: row.type as Match["type"],
    map: row.map as Match["map"],
    rival: row.rival as string,
    scoreUs: row.score_us as number,
    scoreThem: row.score_them as number,
    ctPistol: row.ct_pistol as Match["ctPistol"],
    ctSecondRound: row.ct_second_round as Match["ctSecondRound"],
    ctSetup: (row.ct_setup as Match["ctSetup"]) || "WIN",
    ctFinalizacion: (row.ct_finalizacion as Match["ctFinalizacion"]) || "WIN",
    trPistol: row.tr_pistol as Match["trPistol"],
    trSecondRound: row.tr_second_round as Match["trSecondRound"],
    trSetup: (row.tr_setup as Match["trSetup"]) || "WIN",
    trFinalizacion: (row.tr_finalizacion as Match["trFinalizacion"]) || "WIN",
    startingSide: row.starting_side as Match["startingSide"],
    notes: row.notes as string,
    recorded_by: (row.recorded_by as string) || "",
    demo_data: (row.demo_data as unknown) ?? null,
    tournamentId: (row.tournament_id as string | null) ?? null,
    tournamentName: ((row.tournaments as { name?: string } | null)?.name as string | undefined) ?? null,
  };
}

function matchToDb(match: Partial<Match> & { recorded_by?: string }) {
  return {
    date: match.date,
    type: match.type,
    map: match.map,
    rival: match.rival || "",
    score_us: match.scoreUs,
    score_them: match.scoreThem,
    ct_pistol: match.ctPistol,
    ct_second_round: match.ctSecondRound,
    ct_setup: match.ctSetup || "WIN",
    ct_finalizacion: match.ctFinalizacion || "WIN",
    tr_pistol: match.trPistol,
    tr_second_round: match.trSecondRound,
    tr_setup: match.trSetup || "WIN",
    tr_finalizacion: match.trFinalizacion || "WIN",
    starting_side: match.startingSide,
    notes: match.notes || "",
    recorded_by: match.recorded_by || "",
    tournament_id: match.tournamentId || null,
  };
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
