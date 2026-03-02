import { describe, it, expect } from "vitest";
import { computeMatchup } from "@/lib/matchup";
import type { RosterPlayer, PlayerStats } from "@/lib/types";

function makePlayer(name: string, team: string): RosterPlayer {
  return { id: "1", player_name: name, nba_team: team, created_at: "" };
}

function makeStats(
  name: string,
  team: string,
  overrides: Partial<PlayerStats> = {}
): PlayerStats {
  return {
    id: "1",
    player_name: name,
    nba_team: team,
    stat_type: "season",
    pts: 20,
    reb: 5,
    ast: 4,
    stl: 1,
    blk: 0.5,
    tov: 2,
    three_pm: 2,
    fgm: 8,
    fga: 16,
    ftm: 4,
    fta: 5,
    updated_at: "",
    ...overrides,
  };
}

const gameCounts: Record<string, number> = { "Los Angeles Lakers": 3, "Boston Celtics": 2 };

describe("computeMatchup", () => {
  it("projects counting stats as avg × games", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 27, stat_type: "season" }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    // LeBron: 25 * 3 = 75; Tatum: 27 * 2 = 54
    expect(pts.userTotal).toBeCloseTo(75);
    expect(pts.opponentTotal).toBeCloseTo(54);
    expect(pts.winner).toBe("user");
  });

  it("marks turnovers as user win when user has fewer", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { tov: 1 }),
      makeStats("Jayson Tatum", "Boston Celtics", { tov: 3 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const tov = result.categories.find((c) => c.category === "tov")!;
    // LeBron: 1*3 = 3; Tatum: 3*2 = 6 → user wins (fewer TO)
    expect(tov.winner).toBe("user");
  });

  it("computes weighted FG% across the roster", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { fgm: 8, fga: 16 }), // 0.500
      makeStats("Jayson Tatum", "Boston Celtics", { fgm: 7, fga: 20 }),     // 0.350
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const fg = result.categories.find((c) => c.category === "fg_pct")!;
    // user: (8*3)/(16*3) = 24/48 = 0.5; opp: (7*2)/(20*2) = 14/40 = 0.35
    expect(fg.userTotal).toBeCloseTo(0.5);
    expect(fg.opponentTotal).toBeCloseTo(0.35);
    expect(fg.winner).toBe("user");
  });

  it("returns a tie when totals are equal", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 10 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 15 }), // 15*2 = 30 = 10*3
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.winner).toBe("tie");
  });

  it("excludes players with no stats entry from totals", () => {
    const user = [
      makePlayer("LeBron James", "Los Angeles Lakers"),
      makePlayer("Unknown Player", "Los Angeles Lakers"),
    ];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    // Only LeBron counted: 25*3=75
    expect(pts.userTotal).toBeCloseTo(75);
  });

  it("correctly totals userWins and opponentWins", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    // Give user dominant stats except TO and FG%
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", {
        pts: 100, reb: 100, ast: 100, stl: 100, blk: 100,
        three_pm: 100, fgm: 5, fga: 10, ftm: 100, fta: 100, tov: 100,
      }),
      makeStats("Jayson Tatum", "Boston Celtics", {
        pts: 1, reb: 1, ast: 1, stl: 1, blk: 1,
        three_pm: 1, fgm: 9, fga: 10, ftm: 1, fta: 100, tov: 1,
      }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    // User wins: PTS, REB, AST, STL, BLK, 3PM, FT% = 7
    // Opp wins: FG% (opp 0.9 > user 0.5), TO (opp 1*2=2 < user 100*3=300) = 2
    expect(result.userWins).toBe(7);
    expect(result.opponentWins).toBe(2);
  });

  it("filters stats by stat_type", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25, stat_type: "season" }),
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 30, stat_type: "last10" }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10, stat_type: "season" }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10, stat_type: "last10" }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "last10");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.userTotal).toBeCloseTo(90); // 30 * 3
  });

  it("contributes zero for players whose team has no games in range", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp  = [makePlayer("Steph Curry", "Golden State Warriors")]; // not in gameCounts
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25 }),
      makeStats("Steph Curry",  "Golden State Warriors", { pts: 30 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.opponentTotal).toBeCloseTo(0); // 30 * 0 games
    expect(pts.winner).toBe("user");
  });

  it("returns zero FG% when all players have zero attempts", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp  = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { fgm: 0, fga: 0 }),
      makeStats("Jayson Tatum",  "Boston Celtics",    { fgm: 0, fga: 0 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const fg = result.categories.find((c) => c.category === "fg_pct")!;
    expect(fg.userTotal).toBe(0);
    expect(fg.opponentTotal).toBe(0);
    expect(fg.winner).toBe("tie");
  });

  it("sums contributions from multiple players on the same roster", () => {
    const user = [
      makePlayer("LeBron James",  "Los Angeles Lakers"),
      makePlayer("Anthony Davis", "Los Angeles Lakers"),
    ];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James",  "Los Angeles Lakers", { pts: 25 }),
      makeStats("Anthony Davis", "Los Angeles Lakers", { pts: 20 }),
      makeStats("Jayson Tatum",  "Boston Celtics",     { pts: 30 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.userTotal).toBeCloseTo(135); // (25+20)*3
    expect(pts.opponentTotal).toBeCloseTo(60); // 30*2
    expect(pts.winner).toBe("user");
  });
});
