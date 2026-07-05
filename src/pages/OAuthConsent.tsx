import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Beta wrapper — supabase.auth.oauth is not in current @supabase/supabase-js
// typings yet, so we type it locally instead of touching the auto-generated client.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{
    data:
      | {
          client?: { name?: string; client_uri?: string };
          scopes?: string[];
          redirect_url?: string;
          redirect_to?: string;
        }
      | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] =
    useState<Awaited<ReturnType<OAuthApi["getAuthorizationDetails"]>>["data"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Falta el parámetro authorization_id.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("El servidor de autorización no devolvió una URL de retorno.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-destructive/40">
          <CardHeader>
            <h1 className="text-lg font-heading font-bold">No se pudo cargar la solicitud</h1>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => (window.location.href = "/")}>Volver</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <img src="/logo.png" alt="TacticalTracker" className="h-14 w-14 animate-pulse" />
      </div>
    );
  }

  const clientName = details.client?.name ?? "un cliente externo";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border card-glow">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src="/logo.png" alt="TacticalTracker" className="h-14 w-14" />
          </div>
          <h1 className="text-lg font-heading font-bold">Conectar {clientName} a tu cuenta</h1>
          <p className="text-xs text-muted-foreground">
            {clientName} podrá usar TacticalTracker con tus permisos (leer partidas, agenda,
            equipo y crear eventos).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? "Autorizando..." : "Autorizar"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Denegar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
