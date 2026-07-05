import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("tt_saved_user") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("tt_saved_user"));
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const trimmed = email.trim().toLowerCase();
    const finalEmail = trimmed.includes("@") ? trimmed : `${trimmed}@hambrientos.com`;
    if (rememberMe) localStorage.setItem("tt_saved_user", email.trim());
    else localStorage.removeItem("tt_saved_user");

    const { error } = await signIn(finalEmail, password);
    if (error) toast.error("Credenciales incorrectas. Intentá de nuevo.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 pointer-events-none opacity-30" style={{
        background: "radial-gradient(circle at 30% 20%, hsl(210 100% 55% / 0.15), transparent 60%)"
      }} />
      <Card className="w-full max-w-sm border-border relative card-glow">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex justify-center">
            <img src="/logo.png" alt="TacticalTracker" className="h-16 w-16" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-widest text-accent text-glow-accent">
              TACTICALTRACKER
            </h1>
            <p className="text-muted-foreground text-xs mt-1 uppercase tracking-widest">CS2 Team Tracker</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuario</label>
              <Input
                placeholder="ej: Boke, kud, koda, ray, pakito, ema, fedu..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña</label>
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
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                Recordar mi usuario
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
