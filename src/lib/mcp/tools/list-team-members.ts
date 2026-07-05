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
  name: "list_team_members",
  title: "List team members",
  description:
    "List the current CS2 roster (player name, steam tag, role, whether they're a coach).",
  inputSchema: {
    include_coaches: z
      .boolean()
      .default(true)
      .describe("Include coaches in the result."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ include_coaches }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let query = db(ctx)
      .from("team_members")
      .select("player_name, steam_tag, role, is_coach, steam_id");
    if (!include_coaches) query = query.eq("is_coach", false);
    const { data, error } = await query.order("is_coach", { ascending: true });
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { members: data ?? [] },
    };
  },
});
