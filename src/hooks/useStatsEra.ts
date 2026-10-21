import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/types/match";

const SETTINGS_KEY = "stats_from_date";

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function matchOnOrAfter(match: Match, fromDate: string) {
  const matchDay = match.date.slice(0, 10);
  return matchDay >= fromDate;
}

export function useStatsEra() {
  const [statsFromDate, setStatsFromDateState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) {
      console.error("No se pudo cargar stats_from_date", error);
      setStatsFromDateState(null);
    } else {
      setStatsFromDateState(toDateOnly(data?.value ?? null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const setStatsFromDate = useCallback(async (next: string | null) => {
    const normalized = toDateOnly(next);
    if (!normalized) {
      const { error } = await supabase.from("team_settings").delete().eq("key", SETTINGS_KEY);
      if (error) throw error;
      setStatsFromDateState(null);
      return;
    }
    const { error } = await supabase.from("team_settings").upsert(
      { key: SETTINGS_KEY, value: normalized },
      { onConflict: "key" },
    );
    if (error) throw error;
    setStatsFromDateState(normalized);
  }, []);

  const filterFromDate = useCallback(
    (matches: Match[], fromDate = statsFromDate) => {
      if (!fromDate) return matches;
      return matches.filter((match) => matchOnOrAfter(match, fromDate));
    },
    [statsFromDate],
  );

  const eraLabel = useMemo(() => {
    if (!statsFromDate) return "Todo el historial";
    const [y, m, d] = statsFromDate.split("-");
    return `Desde ${d}/${m}/${y}`;
  }, [statsFromDate]);

  return {
    statsFromDate,
    setStatsFromDate,
    filterFromDate,
    eraLabel,
    loading,
    refetch: fetchSetting,
  };
}
