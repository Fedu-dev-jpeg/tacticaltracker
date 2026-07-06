import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMatches from "./tools/list-matches";
import getMatchStats from "./tools/get-match-stats";
import listUpcomingEvents from "./tools/list-upcoming-events";
import listTeamMembers from "./tools/list-team-members";
import createAgendaEvent from "./tools/create-agenda-event";

// Direct supabase.co issuer — NEVER the .lovable.cloud proxy (mcp-js rejects
// mismatched issuers per RFC 8414 §3.3). Built from VITE_SUPABASE_PROJECT_ID
// which Vite inlines at build time.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "tacticaltracker-mcp",
  title: "TacticalTracker (Tactical Chaos)",
  version: "0.1.0",
  instructions:
    "Tools for the Tactical Chaos CS2 team tracker. Use `list_matches` to browse recent matches, `get_match_stats` for per-player breakdowns, `list_team_members` for the roster, `list_upcoming_events` for the agenda, and `create_agenda_event` to schedule a new training/tactical.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listMatches,
    getMatchStats,
    listUpcomingEvents,
    listTeamMembers,
    createAgendaEvent,
  ],
});
