import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingPlayerStat {
  id: string;
  match_id: string;
  user_id: string | null;
  steam_id: string | null;
  steam_tag: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | null;
  rating: number | null;
  role: string | null;
}

export interface PendingMatch {
  id: string;
  date: string;
  type: string | null;
  map: string | null;
  rival: string | null;
  score_us: number | null;
  score_them: number | null;
  starting_side: string | null;
  notes: string | null;
  demo_data: unknown;
  created_at: string;
  stats: PendingPlayerStat[];
}

export function usePendingMatches() {
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const { data: matches, error } = await supabase
      .from("matches")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("*" as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("confirmed" as any, false)
      .order("created_at", { ascending: false });
    if (error || !matches) {
      setPending([]);
      setLoading(false);
      return;
    }
    const ids = (matches as { id: string }[]).map((m) => m.id);
    let stats: PendingPlayerStat[] = [];
    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from("player_stats")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, match_id, user_id, steam_id, steam_tag, kills, deaths, assists, adr, rating, role" as any)
        .in("match_id", ids);
      stats = (rows as unknown as PendingPlayerStat[]) ?? [];
    }
    const byMatch = new Map<string, PendingPlayerStat[]>();
    for (const s of stats) {
      const arr = byMatch.get(s.match_id) ?? [];
      arr.push(s);
      byMatch.set(s.match_id, arr);
    }
    const combined: PendingMatch[] = (matches as unknown as PendingMatch[]).map((m) => ({
      ...m,
      stats: byMatch.get(m.id) ?? [],
    }));
    setPending(combined);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) fetchPending();
  }, [user, fetchPending]);

  useEffect(() => {
    const channel = supabase
      .channel(`pending-matches-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchPending())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_stats" }, () => fetchPending())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPending]);

  return { pending, loading, refetch: fetchPending, count: pending.length };
}
