import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

// Only allow same-origin, path-only redirects to prevent open-redirect abuse.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function Login() {
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("tt_saved_user") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("tt_saved_user"));
  const [loading, setLoading] = useState(false);

  const nextTarget = safeNext(new URLSearchParams(window.location.search).get("next"));

  // If already signed in (e.g. returning from a bounce), honor `next` immediately.
  useEffect(() => {
    if (user && nextTarget) window.location.href = nextTarget;
  }, [user, nextTarget]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const trimmed = email.trim().toLowerCase();
    const finalEmail = trimmed.includes("@") ? trimmed : `${trimmed}@hambrientos.com`;
    if (rememberMe) localStorage.setItem("tt_saved_user", email.trim());
    else localStorage.removeItem("tt_saved_user");

    const { error } = await signIn(finalEmail, password);
    if (error) {
      toast.error("Credenciales incorrectas. Intentá de nuevo.");
      setLoading(false);
      return;
    }
    if (nextTarget) {
      window.location.href = nextTarget;
      return;
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(0,207,255,0.12) 0%, transparent 60%)",
          backgroundImage:
            "radial-gradient(circle, rgba(0,207,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <Card className="w-full max-w-sm border-accent/20 bg-card relative cyber-card">
        <span className="cyber-corner cyber-corner-tl" />
        <span className="cyber-corner cyber-corner-tr" />
        <span className="cyber-corner cyber-corner-bl" />
        <span className="cyber-corner cyber-corner-br" />
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex justify-center">
            <img src="/logo.png" alt="TacticalTracker" className="h-16 w-16" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-[0.12em] text-accent text-glow-accent">
              TACTICALTRACKER
            </h1>
            <p className="text-muted-foreground text-[9px] mt-1 uppercase tracking-[0.16em] font-mono">
              CS2 Team Tracker · ONLINE
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">// USUARIO</label>
              <Input
                placeholder="ej: Boke, kud, koda, ray, pakito, ema, fedu..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">// CONTRASEÑA</label>
              <Input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(c) => setRememberMe(c === true)}
              />
              <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer font-mono uppercase tracking-wide">
                Recordar mi usuario
              </label>
            </div>
            <Button
              type="submit"
              className="w-full rounded-[3px] bg-accent/10 border border-accent/25 text-accent hover:bg-accent/20 font-mono uppercase tracking-[0.08em]"
              disabled={loading}
            >
              {loading ? "CONECTANDO..." : "ENTRAR AL SISTEMA"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
