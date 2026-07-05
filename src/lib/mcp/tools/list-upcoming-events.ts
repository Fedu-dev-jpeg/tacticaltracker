import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_upcoming_events",
  title: "List upcoming agenda events",
  description:
    "List upcoming training sessions, tacticals, and team events from the agenda.",
  inputSchema: {
    days_ahead: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(14)
      .describe("How many days into the future to look."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ days_ahead }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + days_ahead * 86400000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await db(ctx)
      .from("agenda_events")
      .select("id, date, time_start, time_end, title, description, event_type")
      .gte("date", today)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("time_start", { ascending: true });
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
