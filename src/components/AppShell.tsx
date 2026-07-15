import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import type { Match } from "@/types/match";

export default function AppShell({ children, matches }: { children: ReactNode; matches: Match[] }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader matches={matches} />
          <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
