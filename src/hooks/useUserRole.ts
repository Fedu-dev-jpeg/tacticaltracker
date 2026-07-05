import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "player" | "coach" | "admin";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setRole((data?.role as AppRole) ?? "player");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isCoach: role === "coach",
    isPlayer: role === "player",
  };
}
