import { it, expect } from "vitest";
import { buildUsage, parseCsv, parseDefenseAlignment, parseReceivers } from "./receivers";

const html = `
<table id="neorazzstatstable" class="tablesorter">
  <THEAD><tr class="sorter-head"><th>#</th><th>Player</th><th>Pos</th><th>Team</th><th>Games</th><th>Total Points</th>
  <th>Slot PPG</th><th>Slot%</th><th>Wide PPG</th><th>Wide%</th></tr></THEAD>
  <tr><td colspan="10">Note: Filters and sorting in the table below apply to the output</td></tr>
  <tr><td></td><td>CeeDee Lamb</td><td>WR</td><td>DAL</td><td>9</td><td>22.5</td><td>7.3</td><td>33%</td><td>15.1</td><td>67%</td></tr>
  <tr><td></td><td>Nobody</td><td>WR</td><td>NYJ</td><td>2</td><td>1.0</td><td>-</td><td>0%</td><td>1.0</td><td>100%</td></tr>
</table>`;

it("parses the Razzball slot vs wide table", () => {
  expect(parseReceivers(html)).toEqual([
    { player: "CeeDee Lamb", team: "DAL", games: 9, ppg: 22.5, slot_ppg: 7.3, slot_pct: 33, wide_ppg: 15.1, wide_pct: 67 },
    { player: "Nobody", team: "NYJ", games: 2, ppg: 1.0, slot_ppg: null, slot_pct: 0, wide_ppg: 1.0, wide_pct: 100 },
  ]);
});

it("builds WR usage and this week's matchup from nflverse CSVs", () => {
  const stats = parseCsv(
    [
      "player_display_name,position,season_type,week,game_id,team,opponent_team,targets,target_share,air_yards_share,fantasy_points_ppr",
      "Marvin Harrison Jr.,WR,REG,1,g1,ARI,LA,10,0.4,0.5,20",
      "Marvin Harrison Jr.,WR,REG,2,g2,ARI,SF,6,0.2,0.3,8",
      "Some Guy,WR,REG,1,g3,DAL,SF,4,0.1,0.1,12",
      "Some RB,RB,REG,1,g3,DAL,SF,4,0.1,0.1,30",
    ].join("\n"),
  );
  const snaps = parseCsv("player,position,game_type,offense_snaps,offense_pct\nMarvin Harrison,WR,REG,60,0.9\nMarvin Harrison,WR,REG,50,0.7\n");
  const games = parseCsv(
    [
      "season,game_type,week,home_team,away_team,result,spread_line,total_line",
      "2026,REG,2,SF,ARI,7,3,44",
      '2026,REG,3,SF,ARI,,"3",44',
      "2026,REG,4,DAL,NYG,,,",
    ].join("\n"),
  );
  const u = buildUsage(stats, snaps, games, 2026);
  expect(u.get("marvin harrison")).toEqual({
    snap_pct: 80,
    tgt_pg: 8,
    tgt_pct: expect.closeTo(30),
    tgt_l3_pct: expect.closeTo(30),
    air_pct: 40,
    opp: "@SF",
    team_total: 20.5, // (44 - 3) / 2: away team, home favored by 3
    opp_wr_ppg: 10, // SF allowed 8 + 12 WR points over 2 games; RB points don't count
  });
  expect(u.get("some guy")?.opp).toBeNull(); // DAL's game is week 4, so it's on bye in week 3
});

it("parses Razzball's defensive slot vs wide table into nflverse codes", () => {
  const d = parseDefenseAlignment(`<table id="neorazzstatstable"><tr><th>#</th></tr>
    <tr><td></td><td>ARZ</td><td>24.7</td><td>9.5</td><td>15.2</td><td>33%</td><td>56%</td><td>LA</td></tr>
    <tr><td></td><td>KC</td><td>22.6</td><td>11.2</td><td>-</td><td>45%</td><td>44%</td><td>ATL</td></tr></table>`);
  expect([...d]).toEqual([
    ["ARI", { slot: 9.5, wide: 15.2 }],
    ["KC", { slot: 11.2, wide: null }],
  ]);
});
