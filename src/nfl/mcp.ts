import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BASES, type Basis, LAST_REGULAR_SEASON_WEEK, fetchWeekMatchups, kickerStats, loadKickerStats } from "./kickers";
import { PRESETS, type Preset, loadDstDoc } from "./dst";
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
        "Raw kicker matchup stats for an NFL week, one row per kicker, alphabetical by team: teamFga = the team's FG attempts/game, oppFgmAllowed = FG made/game the opponent's defense allows, home, indoor (dome or retractable roof), weather (forecast, only a few days out). Weigh them yourself; there is no combined score. Games already kicked off are excluded.",
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
      return json({ week: current.week, basis, picks: kickerStats(current.matchups, stats, basis).sort((a, b) => a.team.localeCompare(b.team)) });
    },
  );

  server.registerTool(
    "get_dst_stats",
    {
      description:
        "Raw D/ST matchup stats for the latest published NFL week, one row per defense, alphabetical by team. Weigh them yourself to pick a D/ST: " +
        "lines (opp_implied_total, spread, d_win_prob, implied_total_move), opp_qb (sack/INT/fumble rates, career starts, dropbacks), " +
        "opp_offense (sack rate allowed, giveaways, points, yards/play, fpa_to_dst = avg fantasy points D/STs scored vs them), " +
        "defense (sacks, sack rate, takeaways, points and yards/play allowed, dst_fpts_per_game under the chosen scoring, return TDs), " +
        "context (rest, divisional, roof, wind, temp), next_week, and flags (see flag_legend). " +
        "Rates are fractions (0.06 = 6%). Each *_rank is the league rank, 1 = most favorable for the D/ST. 'games' fields give sample size.",
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
      // Alphabetical, so the order doesn't hint at a pick.
      const teams = doc.teams
        .filter((t) => !team || t.team === team.toUpperCase())
        .sort((a, b) => a.team.localeCompare(b.team));
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
