import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AGENDA_QUERY_KEY, fetchAgendaEvents } from "@/hooks/useAgendaEvents";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import Dashboard from "@/components/Dashboard";
import Registrar from "@/pages/Registrar";
import Analysis from "@/components/Analysis";
import HistoryView from "@/components/HistoryView";
import Agenda from "@/components/Agenda";
import Playbook from "@/components/Playbook";
import MapView from "@/components/MapView";
import Torneos from "./pages/Torneos";
import Awards from "./pages/Awards";
import Equipo from "./pages/Equipo";
import Auditoria from "./pages/Auditoria";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";
import { useMatches } from "@/hooks/useMatches";
import { useNavigate } from "react-router-dom";

const queryClient = new QueryClient();

function Routed() {
  const { matches, addMatch, updateMatch, deleteMatch, importData, exportData } = useMatches();
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<Dashboard matches={matches} />} />
      <Route
        path="/registrar"
        element={
          <Registrar
            onSubmit={(m) => {
              addMatch(m);
              navigate("/");
            }}
          />
        }
      />
      <Route path="/stats" element={<Analysis matches={matches} />} />
      <Route
        path="/historial"
        element={
          <HistoryView
            matches={matches}
            onDelete={deleteMatch}
            onUpdate={updateMatch}
            onExport={exportData}
            onImport={importData}
          />
        }
      />
      <Route path="/torneos" element={<Torneos />} />
      <Route path="/agenda" element={<Agenda />} />
      <Route path="/playbook" element={<Playbook />} />
      <Route path="/awards" element={<Awards />} />
      <Route path="/mapas" element={<MapView matches={matches} />} />
      <Route path="/equipo" element={<Equipo />} />
      <Route path="/auditoria" element={<Auditoria />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  // Prefetch agenda events as soon as the user is authenticated so opening
  // /agenda later renders instantly from cache instead of triggering a fetch.
  useEffect(() => {
    if (!user) return;
    queryClient.prefetchQuery({
      queryKey: AGENDA_QUERY_KEY,
      queryFn: fetchAgendaEvents,
      staleTime: 5 * 60 * 1000,
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <img src="/logo.png" alt="TacticalTracker" className="h-14 w-14 animate-pulse" />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <AppShell>
      <Routed />
    </AppShell>
  );
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          {/* Public routes render outside the auth gate. */}
          <Routes>
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<AppContent />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
