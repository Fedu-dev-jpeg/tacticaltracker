import { useState } from "react";
import Layout, { TabId } from "@/components/Layout";
import TrainingForm from "@/components/TrainingForm";
import Dashboard from "@/components/Dashboard";
import Analysis from "@/components/Analysis";
import HistoryView from "@/components/HistoryView";
import MapView from "@/components/MapView";
import TournamentProgress from "@/components/TournamentProgress";
import { useMatches } from "@/hooks/useMatches";

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const { matches, addMatch, updateMatch, deleteMatch, importData, exportData } = useMatches();

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
          onExport={exportData}
          onImport={importData}
        />
      )}
      {activeTab === "maps" && <MapView matches={matches} />}
      {activeTab === "tournament" && <TournamentProgress matches={matches} />}
    </Layout>
  );
}
