import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Tournament {
  id: string;
  name: string;
  start_date: string; // ISO
  format: string; // BO1, BO3, BO5, etc.
  status: "upcoming" | "in_progress" | "completed" | "cancelled" | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .order("start_date", { ascending: true });
    if (!error && data) setTournaments(data as Tournament[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { tournaments, loading, refetch: fetchAll };
}

/** Returns the next tournament that hasn't finished yet, or null. */
export function getUpcomingTournament(list: Tournament[]): Tournament | null {
  const now = Date.now();
  const alive = list
    .filter((t) => t.status !== "completed" && t.status !== "cancelled")
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  // Prefer nearest upcoming; if all in past, still show the most recent alive one.
  const future = alive.find((t) => new Date(t.start_date).getTime() >= now);
  return future ?? alive[0] ?? null;
}
