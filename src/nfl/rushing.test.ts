import { it, expect } from "vitest";
import { nextGames, parseCsv } from "./receivers";
import { mergeRushDefense, parseRushDefense, parseRushers } from "./rushing";

it("parses RB zone/gap carries and joins the next opponent's run defense", () => {
  const rushers = parseRushers(`<table id="neorazzstatstable"><tr><th>#</th></tr>
    <tr><td></td><td>Derrick Henry</td><td>BLT</td><td>9</td><td>113</td><td>65%</td><td>61</td><td>35%</td><td>1</td><td>1%</td><td>175</td></tr>
    <tr><td></td><td>D'Andre Swift</td><td>CHI</td><td>9</td><td>50</td><td>50%</td><td>50</td><td>50%</td><td>0</td><td>0%</td><td>100</td></tr></table>`);
  const defense = parseRushDefense(`<table id="neorazzstatstable"><tr><th>#</th></tr>
    <tr><td></td><td>BLT</td><td>96</td><td>51.1</td><td>32.1</td><td>53%</td><td>34%</td><td>12</td><td>LAC</td><td>93</td><td>50%</td><td>35%</td><td>9%</td></tr>
    <tr><td></td><td>KC</td><td>90</td><td>40.0</td><td>-</td><td>53%</td><td>34%</td><td>12</td><td>BLT</td><td>93</td><td>50%</td><td>35%</td><td>9%</td></tr>
    <tr><td></td><td>CHI</td><td>90</td><td>40.0</td><td>30.0</td><td>53%</td><td>34%</td><td>12</td><td>BYE</td><td>93</td><td>50%</td><td>35%</td><td>9%</td></tr>
    <tr><td></td><td>NFL Average</td><td>101</td><td>48.9</td><td>38.3</td><td>49%</td><td>38%</td><td>13</td><td>NFL Average</td><td>99</td><td>49%</td><td>32%</td><td>5%</td></tr></table>`);
  expect(defense.size).toBe(3);
  // Razzball's own next-opponent column (LAC) is ignored: the schedule says BAL plays at KC this week.
  const next = nextGames(parseCsv("season,game_type,week,home_team,away_team,result,spread_line,total_line\n2026,REG,10,LAC,BAL,3,,\n2026,REG,11,KC,BAL,,,\n"), 2026);
  expect(mergeRushDefense(rushers, defense, next)).toEqual([
    { player: "Derrick Henry", team: "BLT", games: 9, zone_att: 113, zone_pct: 65, gap_att: 61, gap_pct: 35, total_att: 175, opp: "@KC", opp_zone_ypg: 40, opp_gap_ypg: null },
    { player: "D'Andre Swift", team: "CHI", games: 9, zone_att: 50, zone_pct: 50, gap_att: 50, gap_pct: 50, total_att: 100, opp: "BYE", opp_zone_ypg: null, opp_gap_ypg: null },
  ]);
});
