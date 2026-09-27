import { it, expect } from "vitest";
import { parseStatTable } from "./teamrankings";

const html = `
<table class="tr-table datatable scrollable">
  <thead><tr><th>Rank</th><th>Team</th><th>2026</th><th>Last 3</th><th>Last 1</th><th>Home</th><th>Away</th><th>2025</th></tr></thead>
  <tbody><tr>
    <td data-sort="1">1</td>
    <td data-sort="NY Giants"><a href="https://www.teamrankings.com/nfl/team/new-york-giants">NY Giants</a></td>
    <td data-sort="0.5">0.5</td><td data-sort="0">0.0</td><td data-sort="1">1.0</td>
    <td data-sort="">--</td><td data-sort="0">0.0</td><td data-sort="1.88235">1.9</td>
  </tr></tbody>
</table>`;

it("parses a TeamRankings stat table", () => {
  expect(parseStatTable(html, "field-goal-attempts-per-game")).toEqual([
    {
      team: "New York Giants",
      season: 2026,
      stat: "field-goal-attempts-per-game",
      season_avg: 0.5,
      last3: 0,
      last1: 1,
      home: null,
      away: 0,
      prev_season_avg: 1.88235,
    },
  ]);
});
