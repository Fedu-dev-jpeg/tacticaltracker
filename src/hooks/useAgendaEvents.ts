import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgendaEventRow {
  id: string;
  date: string;
  time_start: string;
  time_end: string;
  title: string;
  description: string;
  event_type: string;
  created_by: string;
  teamup_event_id?: string | null;
}

export const AGENDA_QUERY_KEY = ["agenda_events"] as const;

export async function fetchAgendaEvents(): Promise<AgendaEventRow[]> {
  const { data, error } = await supabase
    .from("agenda_events")
    .select("*")
    .order("date")
    .order("time_start");
  if (error) throw error;
  return (data ?? []) as AgendaEventRow[];
}

export function useAgendaEvents() {
  return useQuery({
    queryKey: AGENDA_QUERY_KEY,
    queryFn: fetchAgendaEvents,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useInvalidateAgenda() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: AGENDA_QUERY_KEY });
}
