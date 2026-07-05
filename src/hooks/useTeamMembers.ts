import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TeamMember {
  id: string;
  user_id: string;
  player_name: string;
  steam_id: string | null;
  steam_tag: string | null;
  role_in_team: string | null;
  is_coach: boolean;
  avatar_url: string | null;
  steam_avatar_url: string | null;
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .order("is_coach", { ascending: true })
      .order("player_name");
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateMember = async (id: string, patch: Partial<TeamMember>) => {
    const { error } = await supabase.from("team_members").update(patch).eq("id", id);
    if (!error) refetch();
    return { error };
  };

  return { members, loading, refetch, updateMember };
}
