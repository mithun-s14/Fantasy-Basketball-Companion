import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BASES, type Basis, LAST_REGULAR_SEASON_WEEK, fetchWeekMatchups, loadKickerStats, rankKickers } from "./kickers";
import { DEFAULT_SORT, PRESETS, type Preset, loadDstDoc, sortTeams } from "./dst";
import { loadCoverage } from "./coverage";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const matches = (name: string, query?: string) => !query || name.toLowerCase().includes(query.toLowerCase());
const readOnly = { readOnlyHint: true, openWorldHint: false };

// Read-only MCP tools over the same data the /nfl pages show.
export function createNflMcpServer() {
  const server = new McpServer({ name: "nfl-streamers", version: "1.0.0" });

  server.registerTool(
    "get_kicker_streamers",
    {
      description:
        "Fantasy kicker streaming ranks for an NFL week. edge = opponent FG made allowed/game minus the team's FG attempts/game; higher is better. Games already kicked off are excluded.",
      inputSchema: {
        week: z.number().int().min(1).max(LAST_REGULAR_SEASON_WEEK).optional().describe("Regular-season week; omit for the current week"),
        basis: z
          .enum(Object.keys(BASES) as [Basis, ...Basis[]])
          .default("season_avg")
          .describe("Stat window: this season, last 3 games, or last season"),
      },
      annotations: readOnly,
    },
    async ({ week, basis }) => {
      const [current, stats] = await Promise.all([fetchWeekMatchups(week), loadKickerStats()]);
      return json({ week: current.week, basis, picks: rankKickers(current.matchups, stats, basis) });
    },
  );

  server.registerTool(
    "get_dst_rankings",
    {
      description:
        "D/ST streaming data for the latest published NFL week: betting lines, opposing QB and offense rates, the defense's own rates, game context, flags. Sorted by opponent implied total, lowest (best for the D/ST) first.",
      inputSchema: {
        scoring: z
          .enum(Object.keys(PRESETS) as [Preset, ...Preset[]])
          .default("espn_default")
          .describe("Scoring preset the fantasy points are computed under"),
        team: z.string().optional().describe("Filter to one D/ST by nflverse team code, e.g. 'BAL', 'KC', 'LA' (Rams), 'LAC'"),
      },
      annotations: readOnly,
    },
    async ({ scoring, team }) => {
      const doc = await loadDstDoc(scoring);
      if (!doc) return json({ error: "No D/ST rankings published yet." });
      const teams = sortTeams(doc.teams, DEFAULT_SORT, "asc").filter((t) => !team || t.team === team.toUpperCase());
      return json({ ...doc, teams });
    },
  );

  server.registerTool(
    "get_coverage_schemes",
    {
      description:
        "Per-defense coverage and tendency rates (percent): man, zone, middle closed/open, blitz, light box, heavy box, sub package.",
      inputSchema: { team: z.string().optional().describe("Filter by team name substring") },
      annotations: readOnly,
    },
    async ({ team }) => json((await loadCoverage()).filter((r) => matches(r.team, team))),
  );

  return server;
}
