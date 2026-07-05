import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTeamMembers, TeamMember } from "@/hooks/useTeamMembers";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Users, Save, RefreshCw, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ROLES = ["Rifler", "AWPer", "IGL", "Support", "Lurker", "Entry", "Head Coach", "Assistant Coach"];

export default function Equipo() {
  const { members, loading, refetch, updateMember } = useTeamMembers();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [seeding, setSeeding] = useState(false);

  if (roleLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const runSeed = async () => {
    setSeeding(true);
    const { error } = await supabase.functions.invoke("seed-users");
    setSeeding(false);
    if (error) toast.error("Error al sincronizar roster: " + error.message);
    else {
      toast.success("Roster sincronizado");
      refetch();
    }
  };

  const players = members.filter((m) => !m.is_coach);
  const coaches = members.filter((m) => m.is_coach);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-heading">Administración del Equipo</h1>
            <p className="text-sm text-muted-foreground">
              Vinculá Steam IDs para que las stats de las demos se asignen automáticamente a cada jugador.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={runSeed} disabled={seeding}>
          <RefreshCw className={`h-4 w-4 mr-2 ${seeding && "animate-spin"}`} />
          Sincronizar roster
        </Button>
      </div>

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex gap-3 items-start">
          <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Vinculación automática:</strong> cuando se sube una demo, el parser
            cruza cada jugador por <span className="text-accent">SteamID64</span> (match exacto) y como fallback por{" "}
            <span className="text-accent">Steam tag</span> in-game. Los jugadores sin vincular podés asignarlos manualmente
            después de cada subida.
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">Roster ({players.length})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((m) => (
            <MemberCard key={m.id} member={m} onSave={updateMember} />
          ))}
          {!loading && players.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground">
              Sin jugadores. Presioná "Sincronizar roster" para crearlos.
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" /> Cuerpo Técnico ({coaches.length})
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coaches.map((m) => (
            <MemberCard key={m.id} member={m} onSave={updateMember} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MemberCard({
  member,
  onSave,
}: {
  member: TeamMember;
  onSave: (id: string, patch: Partial<TeamMember>) => Promise<{ error: unknown }>;
}) {
  const [steamId, setSteamId] = useState(member.steam_id ?? "");
  const [steamTag, setSteamTag] = useState(member.steam_tag ?? "");
  const [roleInTeam, setRoleInTeam] = useState(member.role_in_team ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    steamId !== (member.steam_id ?? "") ||
    steamTag !== (member.steam_tag ?? "") ||
    roleInTeam !== (member.role_in_team ?? "");

  const save = async () => {
    if (steamId && !/^7656119\d{10}$/.test(steamId)) {
      toast.error("Steam ID64 inválido. Debe empezar en 7656119 y tener 17 dígitos.");
      return;
    }
    setSaving(true);
    const { error } = await onSave(member.id, {
      steam_id: steamId || null,
      steam_tag: steamTag || null,
      role_in_team: roleInTeam || null,
    });
    setSaving(false);
    if (error) toast.error("No se pudo guardar");
    else toast.success(`${member.player_name} actualizado`);
  };

  return (
    <Card className="border-border card-glow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center text-sm font-heading text-accent">
              {member.player_name.charAt(0).toUpperCase()}
            </div>
            {member.player_name}
          </CardTitle>
          {member.is_coach && <Badge variant="outline" className="text-[10px]">COACH</Badge>}
          {!member.is_coach && member.steam_id && (
            <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
              LINKED
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">SteamID64</Label>
          <Input
            placeholder="76561198..."
            value={steamId}
            onChange={(e) => setSteamId(e.target.value.trim())}
            className="font-mono text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Steam tag (nick in-game)</Label>
          <Input placeholder="ej: boke-" value={steamTag} onChange={(e) => setSteamTag(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Rol táctico</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={roleInTeam}
            onChange={(e) => setRoleInTeam(e.target.value)}
          >
            <option value="">— seleccionar —</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={save} disabled={!dirty || saving} className="w-full" size="sm">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
}
