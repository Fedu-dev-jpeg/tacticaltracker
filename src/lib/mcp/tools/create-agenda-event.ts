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
  name: "create_agenda_event",
  title: "Create agenda event",
  description:
    "Add a new event to the team agenda (training, tactical, match, meeting). Requires user approval.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Event title."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Date in YYYY-MM-DD (team local time)."),
    time_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .describe("Start time HH:MM (24h)."),
    time_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .describe("End time HH:MM (24h)."),
    event_type: z
      .enum(["training", "tactical", "match", "meeting", "other"])
      .default("training"),
    description: z.string().default(""),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  needsApproval: true,
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await db(ctx)
      .from("agenda_events")
      .insert({
        title: input.title,
        date: input.date,
        time_start: input.time_start,
        time_end: input.time_end,
        event_type: input.event_type,
        description: input.description,
        created_by: ctx.getUserId(),
      })
      .select("id, title, date, time_start, time_end, event_type")
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created event ${data.id}` }],
      structuredContent: { event: data },
    };
  },
});
