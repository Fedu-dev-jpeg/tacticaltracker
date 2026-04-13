import { useState, useEffect } from "react";
import Layout, { TabId } from "@/components/Layout";
import TrainingForm from "@/components/TrainingForm";
import Dashboard from "@/components/Dashboard";
import Analysis from "@/components/Analysis";
import HistoryView from "@/components/HistoryView";
import MapView from "@/components/MapView";
import TournamentProgress from "@/components/TournamentProgress";
import Playbook from "@/components/Playbook";
import { useMatches } from "@/hooks/useMatches";
import { SAMPLE_MATCHES } from "@/data/sampleMatches";
import { toast } from "sonner";

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const { matches, addMatch, updateMatch, deleteMatch, importData, exportData } = useMatches();

  useEffect(() => {
    if (matches.length === 0) {
      const hasDismissed = localStorage.getItem("hambrientos_demo_dismissed");
      if (!hasDismissed) {
        importData(SAMPLE_MATCHES);
        toast.info("Datos de ejemplo cargados. Podés eliminarlos desde el historial.", { duration: 5000 });
      }
    }
  }, []);

  const handleAddMatch = (match: Parameters<typeof addMatch>[0]) => {
    addMatch(match);
    setActiveTab("dashboard");
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "dashboard" && <Dashboard matches={matches} />}
      {activeTab === "add" && <TrainingForm onSubmit={handleAddMatch} />}
      {activeTab === "analysis" && <Analysis matches={matches} />}
      {activeTab === "history" && (
        <HistoryView
          matches={matches}
          onDelete={deleteMatch}
          onUpdate={updateMatch}
          onExport={exportData}
          onImport={importData}
        />
      )}
      {activeTab === "maps" && <MapView matches={matches} />}
      {activeTab === "agenda" && <Agenda />}
      {activeTab === "playbook" && <Playbook />}
    </Layout>
  );
}
