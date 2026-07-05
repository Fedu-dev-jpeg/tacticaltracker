import { Strategy } from "@/components/Playbook";
import { MAPS, MapName } from "@/types/match";
import { X, Shield, Sword, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";

interface Props {
  strategies: Strategy[];
  player: string;
  playerDescription: string;
  onClose: () => void;
}

const TYPE_ORDER = ["Pistol", "Anti-Eco", "Forzado", "Default", "Exec", "Setup", "Dominio", "Retake", "Postplant", "Finalización", "Calls de base", "Sorpresa"];

function sortByType(strats: Strategy[]): Strategy[] {
  return [...strats].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.type);
    const bi = TYPE_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

type DisplayMode = "solo" | "all";

export default function MatchView({ strategies, player, playerDescription, onClose }: Props) {
  const [activeMap, setActiveMap] = useState<MapName>(MAPS[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solo");

  const playerStrats = strategies.filter(s => s.playerRoles[player]);
  const mapStrats = playerStrats.filter(s => s.map === activeMap);
  const ct = sortByType(mapStrats.filter(s => s.side === "CT"));
  const tr = sortByType(mapStrats.filter(s => s.side === "TR"));

  const mapCounts = MAPS.map(m => ({
    map: m,
    count: playerStrats.filter(s => s.map === m).length,
  }));

  // Arrow key navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = MAPS.indexOf(activeMap);
      const next = e.key === "ArrowLeft"
        ? (idx - 1 + MAPS.length) % MAPS.length
        : (idx + 1) % MAPS.length;
      setActiveMap(MAPS[next]);
      setExpandedId(null);
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [activeMap, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const renderStrat = (s: Strategy) => {
    const isExpanded = expandedId === s.id;
    const sideColor = s.side === "CT" ? "text-blue-400 border-blue-500" : "text-red-400 border-red-500";

    return (
      <div
        key={s.id}
        className="bg-[#1a1a1a] border border-[#333] rounded-lg overflow-hidden transition-all"
      >
        <button
          onClick={() => setExpandedId(isExpanded ? null : s.id)}
          className="w-full flex items-center gap-3 p-3 hover:bg-[#222] transition-colors text-left"
        >
          <span className={cn("text-xs font-black border px-2 py-0.5 rounded", sideColor)}>
            {s.side}
          </span>
          <span className="text-[#888] text-xs min-w-[60px]">{s.type}</span>
          <span className="text-white font-bold text-sm flex-1">{s.name}</span>
          <span className="text-[#0088FF] font-semibold text-sm">
            {s.playerRoles[player]}
          </span>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-[#555]" /> : <ChevronDown className="h-4 w-4 text-[#555]" />}
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-[#333]">
            <p className="text-[#ccc] text-sm leading-relaxed pt-2">{s.description}</p>

            <div className="flex flex-wrap gap-2">
              {Object.entries(s.playerRoles)
                .filter(([p]) => displayMode === "all" || p === player)
                .map(([p, r]) => (
                  <span
                    key={p}
                    className={cn(
                      "text-xs px-2 py-1 rounded border",
                      p === player
                        ? "bg-[#0088FF]/20 border-[#0088FF]/50 text-[#0088FF] font-bold"
                        : "bg-[#222] border-[#444] text-[#999]"
                    )}
                  >
                    {p}: {r}
                  </span>
                ))}
            </div>

            {s.notes && (
              <p className="text-[#999] text-xs border-l-2 border-[#0088FF] pl-2 italic">
                {s.notes}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-[#111] border-b border-[#333] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-[#0088FF] text-black font-black text-xs px-3 py-1 rounded">
            MATCH VIEW
          </div>
          <span className="text-white font-bold text-lg">{player}</span>
          <span className="text-[#888] text-sm hidden sm:inline">{playerDescription}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDisplayMode(displayMode === "solo" ? "all" : "solo")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
              displayMode === "all"
                ? "border-[#0088FF]/50 bg-[#0088FF]/10 text-[#0088FF]"
                : "border-[#444] bg-[#222] text-[#888] hover:text-white"
            )}
          >
            {displayMode === "all" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {displayMode === "all" ? "Todos los roles" : "Solo mi rol"}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#222] rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-[#888]" />
          </button>
        </div>
      </div>

      {/* Map tabs */}
      <div className="sticky top-[53px] z-10 bg-[#111] border-b border-[#333] px-4">
        <div className="flex gap-1 overflow-x-auto items-center">
          <span className="text-[#444] text-xs mr-1 hidden sm:inline">◀ ▶</span>
          {mapCounts.map(({ map, count }) => (
            <button
              key={map}
              onClick={() => { setActiveMap(map); setExpandedId(null); }}
              className={cn(
                "px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px whitespace-nowrap",
                activeMap === map
                  ? "border-[#0088FF] text-[#0088FF]"
                  : "border-transparent text-[#666] hover:text-[#aaa]"
              )}
            >
              {map} <span className="text-xs opacity-60">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {ct.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-blue-400" />
              <h2 className="text-blue-400 font-bold text-base">CT SIDE</h2>
              <span className="text-[#555] text-xs">{ct.length} strats</span>
            </div>
            <div className="space-y-2">
              {ct.map(renderStrat)}
            </div>
          </div>
        )}

        {tr.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sword className="h-5 w-5 text-red-400" />
              <h2 className="text-red-400 font-bold text-base">TR SIDE</h2>
              <span className="text-[#555] text-xs">{tr.length} strats</span>
            </div>
            <div className="space-y-2">
              {tr.map(renderStrat)}
            </div>
          </div>
        )}

        {mapStrats.length === 0 && (
          <div className="text-center py-16">
            <p className="text-[#555] text-lg">Sin estrategias para {player} en {activeMap}</p>
          </div>
        )}
      </div>
    </div>
  );
}
