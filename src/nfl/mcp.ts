import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BASES, type Basis, LAST_REGULAR_SEASON_WEEK, fetchWeekMatchups, kickerStats, loadKickerStats } from "./kickers";
import { PRESETS, type Preset, loadDstDoc } from "./dst";
import { loadCoverage } from "./coverage";
import { loadReceivers } from "./receivers";
import { loadRushers } from "./rushing";

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
        "Raw kicker matchup stats for an NFL week, one row per kicker, alphabetical by team: teamFga = the team's FG attempts/game, oppFgmAllowed = FG made/game the opponent's defense allows, teamRzTd = the team's red zone TD rate, oppRzTdAllowed = red zone TD rate the opponent's defense allows (0-1 fractions, null if not scraped; lower means more drives end in FGs), impliedTotal = Vegas implied points for the team (null until a line is posted), home, indoor (dome or retractable roof), weather (forecast, only a few days out). Weigh them yourself; there is no combined score. Games already kicked off are excluded.",
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

  const playerInput = {
    player: z.string().optional().describe("Filter by player name substring"),
    team: z.string().optional().describe("Filter by team abbreviation, e.g. 'DAL'"),
  };
  const byPlayer = <T extends { player: string; team: string }>(rows: T[], player?: string, team?: string) =>
    rows
      .filter((r) => matches(r.player, player) && (!team || r.team.toUpperCase() === team.toUpperCase()))
      .sort((a, b) => a.team.localeCompare(b.team) || a.player.localeCompare(b.player));

  server.registerTool(
    "get_receiver_alignment",
    {
      description:
        "WR fantasy production from the slot vs out wide (Razzball), one row per receiver, alphabetical by team. " +
        "ppg/slot_ppg/wide_ppg = fantasy points per game overall and by alignment; slot_pct/wide_pct = share of the player's fantasy POINTS (not snaps) from that alignment, percent. " +
        "Usage (nflverse): snap_pct, tgt_pg, tgt_pct (target share season), tgt_l3_pct (last 3 games), air_pct (air yards share), all percent. " +
        "This week's matchup: opp (nflverse code, BYE on bye), team_total (Vegas implied points, null until posted), opp_wr_ppg (PPR points/game that defense allows to WRs), opp_slot_ppg/opp_wide_ppg (PPG that defense allows to slot/wide WRs). Nulls mean no match or not scraped.",
      inputSchema: playerInput,
      annotations: readOnly,
    },
    async ({ player, team }) => json(byPlayer(await loadReceivers(), player, team)),
  );

  server.registerTool(
    "get_rb_zone_gap",
    {
      description:
        "RB rush attempts on zone vs gap runs (Razzball), one row per back, alphabetical by team: zone_att/gap_att/total_att, zone_pct/gap_pct (percent of attempts). " +
        "This week's matchup: opp (nflverse code, BYE on bye), opp_zone_ypg/opp_gap_ypg = rush yards/game that defense allows on zone/gap runs. Nulls mean not scraped.",
      inputSchema: playerInput,
      annotations: readOnly,
    },
    async ({ player, team }) => json(byPlayer(await loadRushers(), player, team)),
  );

  return server;
}
