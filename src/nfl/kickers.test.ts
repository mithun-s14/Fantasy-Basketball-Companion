import { it, expect } from "vitest";
import { kickerStats } from "./kickers";

const m = (team: string, opponent: string) => ({ team, opponent, home: true, indoor: false, impliedTotal: null });
const s = (team: string, stat: string, season_avg: number | null) => ({
  team,
  stat,
  season_avg,
  last3: null,
  prev_season_avg: null,
});

it("attaches team FGA and opponent FGM allowed, dropping teams missing data", () => {
  const stats = [
    s("A", "field-goal-attempts-per-game", 2),
    s("B", "field-goal-attempts-per-game", 1),
    s("A", "opponent-field-goals-made-per-game", 1.5),
    s("B", "opponent-field-goals-made-per-game", 3),
    s("A", "red-zone-scoring-pct", 0.5),
    s("A", "opponent-red-zone-scoring-pct", 0.6),
    s("C", "field-goal-attempts-per-game", null), // missing data -> dropped
  ];
  const rows = kickerStats([m("A", "B"), m("B", "A"), m("C", "A")], stats, "season_avg");
  expect(rows.map((r) => [r.team, r.teamFga, r.oppFgmAllowed, r.teamRzTd, r.oppRzTdAllowed])).toEqual([
    ["A", 2, 3, 0.5, null], // red zone stats are optional
    ["B", 1, 1.5, null, 0.6],
  ]);
});
