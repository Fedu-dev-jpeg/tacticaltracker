import { ReactNode } from "react";
import { Focus, BarChart3, ClipboardList, History, Map, Trophy, BookOpen, LogOut, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "add", label: "Nuevo Treino", icon: ClipboardList },
  { id: "analysis", label: "Análisis", icon: Crosshair },
  { id: "history", label: "Historial", icon: History },
  { id: "maps", label: "Mapas", icon: Map },
  { id: "tournament", label: "Torneo", icon: Trophy },
  { id: "playbook", label: "Playbook", icon: BookOpen },
] as const;

export type TabId = (typeof tabs)[number]["id"];

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
}

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const playerName = user?.user_metadata?.player_name || user?.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Focus className="h-7 w-7 text-accent" />
            <h1 className="text-2xl font-heading font-bold tracking-wide">
              <span className="text-accent">FOCUS</span>
              <span className="text-muted-foreground text-sm ml-2 font-body font-normal hidden sm:inline">CS2 Team Tracker</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Hola, <span className="text-accent font-medium">{playerName}</span>
            </span>
            <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Desktop Nav */}
      <nav className="hidden md:block border-b border-border bg-card/50">
        <div className="container flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 container py-6 pb-24 md:pb-6">{children}</main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md">
        <div className="flex justify-around py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1.5 py-1 text-[9px] font-medium transition-colors",
                activeTab === tab.id ? "text-accent" : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label.split(" ").pop()}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
