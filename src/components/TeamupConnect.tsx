import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Link2, RefreshCw, Save, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Integ {
  teamup_calendar_key: string | null;
  teamup_api_key: string | null;
  teamup_last_sync: string | null;
}

const normalizeTeamupCalendarKey = (value: string) => {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] === "c" && parts[1] ? parts[1] : parts[0] ?? raw;
  } catch {
    return raw.replace(/^https?:\/\/teamup\.com\//i, "").split("/")[0];
  }
};

const isCalendarId = (value: string) => /^[A-Za-z0-9]{6}$/.test(value);

export default function TeamupConnect({ onSynced }: { onSynced?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [calKey, setCalKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [calPass, setCalPass] = useState("");
  const [integ, setInteg] = useState<Integ | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("integrations")
      .select("teamup_calendar_key, teamup_api_key, teamup_password, teamup_last_sync")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const d = data as (Integ & { teamup_password?: string | null }) | null;
        setInteg(d ?? null);
        setCalKey(d?.teamup_calendar_key ?? "");
        setApiKey(d?.teamup_api_key ?? "");
        setCalPass(d?.teamup_password ?? "");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);


  const save = async () => {
    if (!user) return;
    const normalizedCalKey = normalizeTeamupCalendarKey(calKey);
    if (normalizedCalKey && isCalendarId(normalizedCalKey)) {
      toast.error("Ese link /c/... no sirve para la API", {
        description: "Pegá un link secreto creado en Teamup → Settings → Sharing → Create Link. Debe empezar con ks...",
      });
      setCalKey(normalizedCalKey);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("integrations").upsert(
      {
        user_id: user.id,
        teamup_calendar_key: normalizedCalKey || null,
        teamup_api_key: apiKey.trim() || null,
        teamup_password: calPass.trim() || null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error("No se pudo guardar: " + error.message);
    else {
      toast.success("Teamup configurado");
      setCalKey(normalizedCalKey);
      setInteg({ teamup_calendar_key: normalizedCalKey, teamup_api_key: apiKey, teamup_last_sync: integ?.teamup_last_sync ?? null });
    }
  };


  const sync = async () => {
    setSyncing(true);
    const t = toast.loading("Trayendo eventos de Teamup...");
    const { data, error } = await supabase.functions.invoke("teamup-sync", { body: { action: "pull" } });
    setSyncing(false);
    if (error) {
      toast.error("Error de sync", { id: t, description: error.message });
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error("Error de sync", { id: t, description: (data as { error: string }).error });
      return;
    }
    const d = data as { imported?: number; total?: number; range?: { start: string; end: string } };
    const imported = d?.imported ?? 0;
    const total = d?.total ?? 0;
    const rangeTxt = d?.range ? `Rango ${d.range.start} → ${d.range.end}` : "";
    toast.success(`Importados ${imported} / ${total} eventos de Teamup`, { id: t, description: rangeTxt });
    setInteg((i) => (i ? { ...i, teamup_last_sync: new Date().toISOString() } : i));
    onSynced?.();
  };

  const isConnected = Boolean(integ?.teamup_calendar_key && integ?.teamup_api_key);

  if (loading) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 text-left"
        >
          <CalendarClock className="h-4 w-4 text-accent" />
          <CardTitle className="text-sm flex-1">Sincronización Teamup</CardTitle>
          {isConnected ? (
            <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
              <Link2 className="h-2.5 w-2.5 mr-1" /> Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Sin conectar</Badge>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              Vincula tu calendario de Teamup. Los eventos importados quedan en la agenda de la app, y los que
              crees acá se pueden publicar de vuelta a Teamup.
            </p>
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1">
              <p className="font-medium text-foreground">¿Cómo obtener la API Key?</p>
              <p>
                Teamup no genera la key desde el panel de usuario: hay que pedirla con un formulario y llega por mail (suele tardar unos minutos).
              </p>
              <p className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Pedila acá:{" "}
                <a
                  href="https://teamup.com/api-keys/request"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  teamup.com/api-keys/request
                </a>
              </p>
              <p>
                En el formulario poné tu email, un nombre de app (ej: "Hambrientos Tracker") y una descripción corta. Cuando llegue el mail, copiá la key (tipo <span className="font-mono">xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span>) y pegala abajo.
              </p>
              <p>
                El <span className="font-medium text-foreground">Calendar Key</span> tiene que salir de un link secreto creado en Teamup → Settings → Sharing → Create Link, y empieza con <span className="font-mono">ks...</span>. El link público <span className="font-mono">/c/48u5qv</span> no funciona para la API sin login.
              </p>
            </div>
          </div>


          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Calendar Key</Label>
              <Input
                value={calKey}
                onChange={(e) => setCalKey(e.target.value)}
                placeholder="ks123abc... (no /c/48u5qv)"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••"
                className="font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Contraseña del calendario (opcional)</Label>
              <Input
                type="password"
                value={calPass}
                onChange={(e) => setCalPass(e.target.value)}
                placeholder="Sólo si tu calendario de Teamup pide login"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Si al sincronizar ves el error <span className="font-mono">login_required</span>, tu calendario está protegido: pegá acá la contraseña que usás para abrirlo en teamup.com.
              </p>
            </div>
          </div>


          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            <Button size="sm" variant="outline" onClick={sync} disabled={!isConnected || syncing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing && "animate-spin"}`} />
              {syncing ? "Sincronizando..." : "Traer eventos de Teamup"}
            </Button>
            {integ?.teamup_last_sync && (
              <span className="text-[11px] text-muted-foreground">
                Último sync: {new Date(integ.teamup_last_sync).toLocaleString("es-AR")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            El pull importa eventos del rango <span className="text-accent">−30 días</span> a <span className="text-accent">+90 días</span> desde hoy. Cada evento nuevo/editado desde la app se publica automáticamente a Teamup (verás toast con el ID).
          </p>
        </CardContent>
      )}
    </Card>
  );
}
