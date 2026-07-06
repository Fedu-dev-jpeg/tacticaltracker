import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  ClipboardList,
  Crosshair,
  History,
  Map,
  CalendarDays,
  BookOpen,
  Trophy,
  Award,
  Users,
  ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerProfileDialog } from "@/components/PlayerProfileDialog";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/registrar", label: "Registrar", icon: ClipboardList },
  { to: "/stats", label: "Stats", icon: Crosshair },
  { to: "/historial", label: "Historial", icon: History },
  { to: "/torneos", label: "Torneos", icon: Trophy },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/playbook", label: "Playbook", icon: BookOpen },
  { to: "/awards", label: "Awards", icon: Award },
  { to: "/mapas", label: "Mapas", icon: Map },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { isAdmin, role } = useUserRole();
  const playerName = user?.user_metadata?.player_name || user?.email?.split("@")[0] || "user";
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("team_members")
      .select("steam_avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.steam_avatar_url ?? null));
  }, [user]);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <Sidebar collapsible="icon">
      <div className="h-[2px] bg-gradient-to-r from-accent to-transparent flex-shrink-0" />
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img src="/logo.png" alt="TacticalTracker" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs font-heading font-bold tracking-[0.12em] text-accent leading-none">
                TACTICAL
              </div>
              <div className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40 leading-none mt-0.5">
                TRACKER · ONLINE
              </div>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF80] flex-shrink-0" />
            <span className="text-[8px] font-mono tracking-[0.12em] uppercase text-[#00FF80]">
              SYSTEM ACTIVE
            </span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && (
            <div className="px-3 py-2 text-[8px] font-mono tracking-[0.16em] uppercase text-muted-foreground/40">
              // EQUIPO
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to)}>
                    <NavLink to={item.to} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && (
                        <span className="uppercase text-[11px] tracking-wide">{item.label}</span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            {!collapsed && (
              <div className="px-3 py-2 text-[8px] font-mono tracking-[0.16em] uppercase text-muted-foreground/40">
                // ADMIN
              </div>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/equipo")}>
                    <NavLink to="/equipo" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {!collapsed && <span className="uppercase text-[11px] tracking-wide">Equipo</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/auditoria")}>
                    <NavLink to="/auditoria" className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      {!collapsed && <span className="uppercase text-[11px] tracking-wide">Auditoría</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <button
          onClick={() => setProfileOpen(true)}
          className={cn(
            "flex items-center gap-2 px-2 py-2 w-full rounded-[3px] hover:bg-sidebar-accent/50 transition text-left",
            collapsed && "flex-col justify-center",
          )}
          title="Ver perfil"
        >
          <Avatar className="h-7 w-7 rounded-[3px] border border-accent/30 flex-shrink-0">
            <AvatarImage src={avatarUrl ?? undefined} alt={playerName} />
            <AvatarFallback className="text-xs font-bold text-accent bg-accent/20 rounded-[3px]">
              {playerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate uppercase tracking-wide">{playerName}</div>
              {role && (
                <Badge variant="outline" className="text-[8px] font-mono uppercase tracking-[0.08em] h-4 px-1.5 rounded-[2px] mt-0.5 border-accent/25 text-accent">
                  {role}
                </Badge>
              )}
            </div>
          )}
        </button>
      </SidebarFooter>
      <div className="h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent flex-shrink-0" />
      <PlayerProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </Sidebar>
  );
}
