import { useQuery } from "@tanstack/react-query";
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

export const TOURNAMENTS_QUERY_KEY = ["tournaments"] as const;

export async function fetchTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

export function useTournaments() {
  const query = useQuery({
    queryKey: TOURNAMENTS_QUERY_KEY,
    queryFn: fetchTournaments,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { tournaments: query.data ?? [], loading: query.isLoading, refetch: query.refetch };
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
