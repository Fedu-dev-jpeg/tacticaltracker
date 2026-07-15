import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardCheck } from "lucide-react";
import TrainingForm from "@/components/TrainingForm";
import PendingConfirmations from "@/components/PendingConfirmations";
import { usePendingMatches } from "@/hooks/usePendingMatches";
import { MATCH_TYPES, type Match, type MatchType } from "@/types/match";

interface RegistrarProps {
  onSubmit: (match: Omit<Match, "id">) => void;
}

export default function Registrar({ onSubmit }: RegistrarProps) {
  const { count } = usePendingMatches();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<string>("new");
  const reminderDate = searchParams.get("date") ?? undefined;
  const requestedType = searchParams.get("type");
  const initialType = MATCH_TYPES.includes(requestedType as MatchType) ? (requestedType as MatchType) : undefined;

  // If a demo lands in pending while the user is in "new", auto-hint by
  // switching to the pending tab the first time count goes from 0 → >0.
  const [seenCount, setSeenCount] = useState(count);
  useEffect(() => {
    if (count > seenCount && tab === "new") {
      setTab("pending");
    }
    setSeenCount(count);
  }, [count, seenCount, tab]);

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nuevo registro
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Confirmaciones pendientes
            {count > 0 && (
              <Badge className="ml-1 h-5 min-w-[20px] px-1 bg-accent text-accent-foreground">
                {count}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <TrainingForm onSubmit={onSubmit} initialDate={reminderDate} initialType={initialType} />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingConfirmations />
        </TabsContent>
      </Tabs>
    </div>
  );
}
