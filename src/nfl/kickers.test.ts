import { it, expect } from "vitest";
import { rankKickers } from "./kickers";

const m = (team: string, opponent: string) => ({ team, opponent, home: true, kickoff: "" });
const s = (team: string, stat: string, season_avg: number | null) => ({
  team,
  stat,
  season_avg,
  last3: null,
  prev_season_avg: null,
});

it("ranks kickers by opponent FG allowed minus own FG attempts", () => {
  const stats = [
    s("A", "field-goal-attempts-per-game", 2),
    s("B", "field-goal-attempts-per-game", 1),
    s("A", "opponent-field-goals-made-per-game", 1.5),
    s("B", "opponent-field-goals-made-per-game", 3),
    s("C", "field-goal-attempts-per-game", null), // missing data -> dropped
  ];
  const ranked = rankKickers([m("A", "B"), m("B", "A"), m("C", "A")], stats, "season_avg");
  expect(ranked.map((r) => [r.team, r.edge])).toEqual([
    ["A", 1], // B allows 3, A attempts 2
    ["B", 0.5], // A allows 1.5, B attempts 1
  ]);
});
