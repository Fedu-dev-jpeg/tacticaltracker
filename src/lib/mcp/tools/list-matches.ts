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
  name: "list_matches",
  title: "List matches",
  description:
    "List the team's recent CS2 matches (map, rival, score, date, type). Most recent first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("How many matches to return (max 50)."),
    match_type: z
      .enum(["OFFICIAL", "TRAINING"])
      .optional()
      .describe("Filter by match type."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit, match_type }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = db(ctx)
      .from("matches")
      .select("id, date, map, rival, score_us, score_them, type, starting_side")
      .order("date", { ascending: false })
      .limit(limit);
    if (match_type) query = query.eq("type", match_type);
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { matches: data ?? [] },
    };
  },
});
