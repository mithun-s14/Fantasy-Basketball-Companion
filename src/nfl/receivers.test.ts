import { it, expect } from "vitest";
import { parseReceivers } from "./receivers";

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
