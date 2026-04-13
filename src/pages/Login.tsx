import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Crosshair } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("focus_saved_user") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("focus_saved_user"));
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const trimmed = email.trim().toLowerCase();
    const finalEmail = trimmed.includes("@") ? trimmed : `${trimmed}@hambrientos.com`;

    if (rememberMe) {
      localStorage.setItem("focus_saved_user", email.trim());
    } else {
      localStorage.removeItem("focus_saved_user");
    }

    const { error } = await signIn(finalEmail, password);
    if (error) {
      toast.error("Credenciales incorrectas. Intentá de nuevo.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex justify-center">
            <Crosshair className="h-12 w-12 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-wide text-accent">
              FOCUS
            </h1>
            <p className="text-muted-foreground text-sm mt-1">CS2 Team Tracker</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Usuario</label>
              <Input
                placeholder="ej: Froud, Fedu, Hanzo..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Contraseña</label>
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
                onCheckedChange={(checked) => setRememberMe(checked === true)}
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
