import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const CACHE_KEY = "hambrientos_steam_avatar_cache_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type CacheMap = Record<string, { url: string; savedAt: number }>;

function readCache(): CacheMap {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeCache(map: CacheMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // quota — ignore
  }
}
function getCached(memberId: string): string | null {
  const c = readCache();
  const entry = c[memberId];
  if (!entry) return null;
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
  return entry.url;
}
function setCached(memberId: string, url: string) {
  const c = readCache();
  c[memberId] = { url, savedAt: Date.now() };
  writeCache(c);
}
function invalidateCache(memberId: string) {
  const c = readCache();
  delete c[memberId];
  writeCache(c);
}

interface SteamAvatarProps {
  memberId?: string | null;
  url?: string | null;
  fallback: string;
  className?: string;
  size?: number;
}

/**
 * Avatar with:
 * - localStorage cache (24h) keyed by team_member.id
 * - Silent retry: on first error retry with cache-busted URL
 * - Auto-recovery: on final failure invoke sync-steam-avatars for that member,
 *   read the fresh URL and swap it in
 */
export default function SteamAvatar({ memberId, url, fallback, className, size = 40 }: SteamAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    const cached = memberId ? getCached(memberId) : null;
    setSrc(cached ?? url ?? null);
    if (url && memberId && cached !== url) setCached(memberId, url);
  }, [memberId, url]);

  const handleError = useCallback(async () => {
    if (attempt === 0 && src) {
      // Retry with cache-buster
      setAttempt(1);
      setSrc(`${src}${src.includes("?") ? "&" : "?"}_r=${Date.now()}`);
      return;
    }
    if (!memberId || refreshing) {
      setFailed(true);
      return;
    }
    // Try to refresh from Steam via edge function
    setRefreshing(true);
    if (memberId) invalidateCache(memberId);
    try {
      const { data, error } = await supabase.functions.invoke("sync-steam-avatars", {
        body: { member_id: memberId },
      });
      const fresh = (data as { results?: { avatar?: string; ok?: boolean }[] })?.results?.[0];
      if (!error && fresh?.ok && fresh.avatar) {
        setCached(memberId, fresh.avatar);
        setSrc(`${fresh.avatar}?_r=${Date.now()}`);
        setAttempt(2);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [attempt, src, memberId, refreshing]);

  const dim = { width: size, height: size };

  if (!src || failed) {
    return (
      <div
        className={cn(
          "rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent font-heading",
          className,
        )}
        style={dim}
      >
        {fallback.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={fallback}
      onError={handleError}
      className={cn("rounded-full object-cover border border-accent/30", className)}
      style={dim}
      referrerPolicy="no-referrer"
    />
  );
}
