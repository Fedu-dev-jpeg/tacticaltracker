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
  name: "get_match_stats",
  title: "Get match stats",
  description:
    "Get one match with per-player stats (kills, deaths, ADR, KAST, rating).",
  inputSchema: {
    match_id: z.string().uuid().describe("The match UUID (from list_matches)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ match_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = db(ctx);
    const [{ data: match, error: matchErr }, { data: stats, error: statsErr }] =
      await Promise.all([
        client
          .from("matches")
          .select(
            "id, date, map, rival, score_us, score_them, type, starting_side, notes",
          )
          .eq("id", match_id)
          .maybeSingle(),
        client
          .from("player_stats")
          .select(
            "steam_tag, kills, deaths, assists, adr, hs_pct, kast_pct, rating, fk, fd",
          )
          .eq("match_id", match_id),
      ]);
    const err = matchErr ?? statsErr;
    if (err) return { content: [{ type: "text", text: err.message }], isError: true };
    if (!match)
      return { content: [{ type: "text", text: "Match not found" }], isError: true };
    const payload = { match, players: stats ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
