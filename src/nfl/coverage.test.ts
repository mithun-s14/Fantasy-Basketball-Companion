import { it, expect } from "vitest";
import { parseCoverage, TENDENCY_COLUMNS } from "./coverage";

const html = `
<table id="table_1" class="responsive display wpDataTable wpDataTableID-91">
  <thead><tr><th>Team</th><th>Man Rate</th><th>Zone Rate</th><th>Middle Closed Rate</th><th>Middle Open Rate</th></tr></thead>
  <tbody><tr id="table_91_row_0">
    <td style="">Arizona Cardinals</td><td style="">9.1</td><td style="">70.9</td><td style="">21.9</td><td style="">-</td>
  </tr></tbody>
</table>`;

it("parses the Sharp coverage schemes table", () => {
  expect(parseCoverage(html)).toEqual([
    { team: "Arizona Cardinals", man_rate: 9.1, zone_rate: 70.9, middle_closed_rate: 21.9, middle_open_rate: null },
  ]);
});

it("parses the Sharp defensive tendencies table", () => {
  const t = html.replace("<td style=\"\">-</td>", "<td>37.0</td>");
  expect(parseCoverage(t, TENDENCY_COLUMNS)).toEqual([
    { team: "Arizona Cardinals", blitz_rate: 9.1, light_box_rate: 70.9, heavy_box_rate: 21.9, sub_package_rate: 37.0 },
  ]);
});
