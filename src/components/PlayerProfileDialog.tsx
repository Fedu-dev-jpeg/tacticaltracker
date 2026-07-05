import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skull, HeartCrack, Crosshair, Flame, Target, Handshake, Copy, LogOut, Map as MapIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useMyPlayerProfile } from "@/hooks/useMyPlayerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function PlayerProfileDialog({ open, onOpenChange }: Props) {
  const { user, signOut } = useAuth();
  const { member, totals, bestMaps, hasStats, loading } = useMyPlayerProfile();

  const displayName = member?.player_name ?? user?.user_metadata?.player_name ?? user?.email?.split("@")[0] ?? "user";
  const roleLabel = member?.is_coach ? "Coach" : member?.role_in_team ?? "Sin rol";

  const pieData = [
    { name: "Kills", value: totals.kills, color: "hsl(var(--success))" },
    { name: "Deaths", value: totals.deaths, color: "hsl(var(--destructive))" },
    { name: "Assists", value: totals.assists, color: "hsl(var(--accent))" },
  ];

  const copySteam = () => {
    if (!member?.steam_id) return;
    navigator.clipboard.writeText(member.steam_id);
    toast.success("SteamID copiado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Perfil de Jugador</DialogTitle>
        </DialogHeader>

        {/* Identity card */}
        <Card className="border-border">
          <CardContent className="p-5 flex items-center gap-5">
            <Avatar className="h-24 w-24 border-2 border-accent/30">
              <AvatarImage src={member?.steam_avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback className="text-2xl bg-accent/20 text-accent font-heading">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl font-heading font-bold">{displayName}</h2>
              {member?.steam_id ? (
                <button
                  onClick={copySteam}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-accent transition"
                >
                  SteamID: {member.steam_id}
                  <Copy className="h-3 w-3" />
                </button>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">SteamID no vinculado</div>
              )}
              <div className="mt-2">
                <Badge variant="outline" className="border-accent/40 text-accent">
                  {roleLabel}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {!hasStats && !loading ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-muted-foreground">Todavía no hay stats registradas para tu cuenta.</p>
              <Button asChild variant="outline" onClick={() => onOpenChange(false)}>
                <Link to="/registrar">Subir demo</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats grid */}
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Estadísticas Globales</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={Skull} label="Kills Totales" value={totals.kills} />
                <StatCard icon={HeartCrack} label="Deaths Totales" value={totals.deaths} />
                <StatCard icon={Crosshair} label="ADR Promedio" value={Math.round(totals.adrAvg)} />
                <StatCard icon={Flame} label="Win Rate Rondas" value={`${Math.round(totals.roundWinRate)}%`} accent />
                <StatCard icon={Target} label="HS% Promedio" value={`${Math.round(totals.hsAvg)}%`} />
                <StatCard icon={Handshake} label="Asistencias" value={totals.assists} />
              </div>
            </div>

            {/* Bottom: best maps + impact */}
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Mejores Mapas (ADR)</h3>
                  {bestMaps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                  ) : (
                    <ul className="space-y-2">
                      {bestMaps.map((m) => (
                        <li
                          key={m.map}
                          className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <MapIcon className="h-4 w-4 text-accent" />
                            {m.map}
                          </span>
                          <span className="text-sm font-mono text-accent">{Math.round(m.adr)} ADR</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Distribución de Impacto</h3>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} innerRadius={45} outerRadius={75} dataKey="value" stroke="none">
                          {pieData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              onOpenChange(false);
              signOut();
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0">
          <div className={`text-2xl font-heading font-bold leading-none ${accent ? "text-accent" : ""}`}>{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
