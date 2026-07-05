import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PlayerProfileData {
  member: {
    player_name: string;
    steam_id: string | null;
    steam_tag: string | null;
    role_in_team: string | null;
    is_coach: boolean;
    steam_avatar_url: string | null;
  } | null;
  totals: {
    kills: number;
    deaths: number;
    assists: number;
    adrAvg: number;
    hsAvg: number;
    roundWinRate: number;
  };
  bestMaps: Array<{ map: string; adr: number }>;
  hasStats: boolean;
  loading: boolean;
  refetch: () => void;
}

export function useMyPlayerProfile(): PlayerProfileData {
  const { user } = useAuth();
  const [member, setMember] = useState<PlayerProfileData["member"]>(null);
  const [totals, setTotals] = useState<PlayerProfileData["totals"]>({
    kills: 0, deaths: 0, assists: 0, adrAvg: 0, hsAvg: 0, roundWinRate: 0,
  });
  const [bestMaps, setBestMaps] = useState<PlayerProfileData["bestMaps"]>([]);
  const [hasStats, setHasStats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: m } = await supabase
        .from("team_members")
        .select("player_name, steam_id, steam_tag, role_in_team, is_coach, steam_avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: stats } = await supabase
        .from("player_stats")
        .select("kills, deaths, assists, adr, hs_pct, match_id")
        .eq("user_id", user.id);

      const rows = stats ?? [];
      const kills = rows.reduce((a, r) => a + (r.kills ?? 0), 0);
      const deaths = rows.reduce((a, r) => a + (r.deaths ?? 0), 0);
      const assists = rows.reduce((a, r) => a + (r.assists ?? 0), 0);
      const adrAvg = rows.length ? rows.reduce((a, r) => a + Number(r.adr ?? 0), 0) / rows.length : 0;
      const hsAvg = rows.length ? rows.reduce((a, r) => a + Number(r.hs_pct ?? 0), 0) / rows.length : 0;

      // fetch match maps + score for best-map calculation and win rate
      const matchIds = [...new Set(rows.map((r) => r.match_id).filter(Boolean))];
      let bestMapsCalc: PlayerProfileData["bestMaps"] = [];
      let roundWinRate = 0;

      if (matchIds.length) {
        const { data: matches } = await supabase
          .from("matches")
          .select("id, map, score_us, score_them")
          .in("id", matchIds);
        const mapToAdr = new Map<string, { sum: number; n: number }>();
        let wonRounds = 0;
        let totalRounds = 0;
        for (const r of rows) {
          const match = matches?.find((mm) => mm.id === r.match_id);
          if (!match?.map) continue;
          const cur = mapToAdr.get(match.map) ?? { sum: 0, n: 0 };
          cur.sum += Number(r.adr ?? 0);
          cur.n += 1;
          mapToAdr.set(match.map, cur);
        }
        for (const match of matches ?? []) {
          const ours = match.score_us ?? 0;
          const theirs = match.score_them ?? 0;
          wonRounds += ours;
          totalRounds += ours + theirs;
        }
        bestMapsCalc = [...mapToAdr.entries()]
          .map(([map, v]) => ({ map, adr: v.n ? v.sum / v.n : 0 }))
          .sort((a, b) => b.adr - a.adr)
          .slice(0, 3);
        roundWinRate = totalRounds ? (wonRounds / totalRounds) * 100 : 0;
      }

      if (cancelled) return;
      setMember(m ?? null);
      setTotals({ kills, deaths, assists, adrAvg, hsAvg, roundWinRate });
      setBestMaps(bestMapsCalc);
      setHasStats(rows.length > 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, tick]);

  return { member, totals, bestMaps, hasStats, loading, refetch: () => setTick((t) => t + 1) };
}
