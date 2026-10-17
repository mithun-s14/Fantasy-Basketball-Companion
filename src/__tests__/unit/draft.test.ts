import { describe, it, expect } from "vitest";
import {
  adpFlag,
  adpRanks,
  categoryProfile,
  categoryRanks,
  suggestPicks,
  nextPickFor,
  normalCdf,
  openSlots,
  pAvailable,
  roundOf,
  teamOnClock,
  withoutLastPick,
} from "@/lib/draft";
import { DEFAULT_SETTINGS } from "@/lib/league";
import type { PoolPlayer, RankedPlayer } from "@/lib/valuation";

describe("snake order", () => {
  it("gives slot 1 picks 1, 24, 25, 48 in a 12-team draft", () => {
    const picks = Array.from({ length: 48 }, (_, i) => i + 1).filter((p) => teamOnClock(p, 12) === 1);
    expect(picks).toEqual([1, 24, 25, 48]);
  });

  it("gives slot N picks 12, 13, 36, 37", () => {
    const picks = Array.from({ length: 48 }, (_, i) => i + 1).filter((p) => teamOnClock(p, 12) === 12);
    expect(picks).toEqual([12, 13, 36, 37]);
  });

  it("covers every slot exactly once per round", () => {
    for (let round = 1; round <= 4; round++) {
      const slots = Array.from({ length: 10 }, (_, i) => teamOnClock((round - 1) * 10 + i + 1, 10));
      expect([...slots].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(roundOf(10, 10)).toBe(1);
    expect(roundOf(11, 10)).toBe(2);
  });
});

describe("nextPickFor", () => {
  it("handles back-to-back picks at the turn", () => {
    expect(nextPickFor(12, 12, 12)).toBe(13); // slot 12 picks again right away
    expect(nextPickFor(12, 13, 12)).toBe(36);
    expect(nextPickFor(1, 1, 12)).toBe(24);
    expect(nextPickFor(1, 24, 12)).toBe(25);
  });

  it("finds the next turn from mid-round", () => {
    expect(nextPickFor(5, 7, 12)).toBe(20);
  });
});

describe("pAvailable", () => {
  it("is near 1 for ADP far past the pick and near 0 well before it", () => {
    expect(pAvailable(80, null, 30)!).toBeGreaterThan(0.99);
    expect(pAvailable(10, null, 30)!).toBeLessThan(0.01);
  });

  it("is 0.5 when the pick equals ADP, and null without ADP", () => {
    expect(pAvailable(30, 5, 30)).toBeCloseTo(0.5, 6);
    expect(pAvailable(null, null, 30)).toBeNull();
  });

  it("uses a deviation floor of 2 for early picks", () => {
    // s = max(2, 0.2 × 3) = 2, so one deviation past ADP 3 is pick 5.
    expect(pAvailable(3, null, 5)).toBeCloseTo(1 - normalCdf(1), 6);
  });

  it("matches the standard normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("withoutLastPick", () => {
  it("removes only the most recent pick", () => {
    const picks = [
      { overall_pick: 2, team_slot: 2, player_name: "B" },
      { overall_pick: 3, team_slot: 3, player_name: "C" },
      { overall_pick: 1, team_slot: 1, player_name: "A" },
    ];
    expect(withoutLastPick(picks).map((p) => p.player_name)).toEqual(["B", "A"]);
    expect(withoutLastPick([])).toEqual([]);
  });
});

describe("openSlots", () => {
  it("fills the most specific slot first", () => {
    const open = openSlots(DEFAULT_SETTINGS.rosterSlots, [
      { positions: ["PG"] },
      { positions: ["PG"] },
      { positions: ["PG"] },
      { positions: ["C"] },
      { positions: [] },
    ]);
    expect(open).toMatchObject({ PG: 0, G: 0, C: 1, UTIL: 0, SG: 1, BENCH: 3 });
  });

  it("sends extra players to the bench and stops at zero", () => {
    const players = Array.from({ length: 20 }, () => ({ positions: ["C"] }));
    const open = openSlots(DEFAULT_SETTINGS.rosterSlots, players);
    expect(open).toMatchObject({ C: 0, UTIL: 0, BENCH: 0, PG: 1 });
  });
});

describe("categoryProfile", () => {
  it("averages z-scores per category", () => {
    const mine = [{ z: { PTS: 1, REB: -1 } }, { z: { PTS: 2, REB: 0 } }] as unknown as RankedPlayer[];
    expect(categoryProfile(mine, ["PTS", "REB"])).toEqual({ PTS: 1.5, REB: -0.5 });
    expect(categoryProfile([], ["PTS"])).toEqual({ PTS: 0 });
  });
});

const ranked = (name: string, value: number, positions: string[], adp: number | null) =>
  ({ player: { name, positions, adp }, value, z: {} }) as unknown as RankedPlayer;
const allOpen = { ...DEFAULT_SETTINGS.rosterSlots };

describe("suggestPicks", () => {
  it("returns the top 3 by score with the driving reason", () => {
    const available = [
      ranked("Top value", 5, ["SF"], 200), // ADP far later: no urgency
      ranked("Center we need", 4.2, ["C"], 200),
      ranked("About to go", 4, ["SF"], 21),
      ranked("Also ran", 3, ["SF"], 200),
    ];
    const open = { ...allOpen, SF: 0, F: 0, C: 2 };
    const s = suggestPicks(available, open, 24);
    // Center: 4.2 + 0.5 × 2 open C slots = 5.2, ahead of Top value's 5.
    expect(s.map((x) => x.ranked.player.name)).toEqual(["About to go", "Center we need", "Top value"]);
    expect(s[0].reason).toMatch(/Likely gone/);
    expect(s[1].reason).toBe("Fills your open C");
    expect(s[2].reason).toMatch(/Best value left/);
  });

  it("words urgency by the actual odds", () => {
    // ADP 11 at pick 9: about 84% he lasts, but at value 6 the urgency still drives it.
    const [s] = suggestPicks([ranked("Mitchell", 6, ["SG"], 11)], { ...allOpen, SG: 0, G: 0 }, 9);
    expect(s.reason).toMatch(/^1\d% chance he's gone by your next pick$/);
  });

  it("doesn't cite need when every candidate gets the same bonus", () => {
    const s = suggestPicks([ranked("PG", 5, ["PG"], null), ranked("SG", 4, ["SG"], null)], allOpen, null);
    expect(s.map((x) => x.reason)).toEqual(["Best value left (5.00)", "Best value left (4.00)"]);
  });

  it("ignores urgency when there's no next pick or no ADP", () => {
    const s = suggestPicks([ranked("A", 2, ["SF"], 1), ranked("B", 3, ["SF"], null)], { ...allOpen, SF: 0, F: 0 }, null);
    expect(s.map((x) => x.score)).toEqual([3, 2]);
  });
});

describe("adpFlag", () => {
  it("flags value and reach beyond two rounds", () => {
    expect(adpFlag(5, 30, 8)).toBe("value");
    expect(adpFlag(30, 5, 8)).toBe("reach");
    expect(adpFlag(10, 24, 8)).toBeNull(); // 14 < 16
    expect(adpFlag(10, null, 8)).toBeNull();
  });

  it("widens the margin to half the ADP rank late in the draft", () => {
    expect(adpFlag(70, 120, 8)).toBeNull(); // 50 < 0.5 × 120
    expect(adpFlag(60, 120, 8)).toBe("value");
  });
});

describe("adpRanks", () => {
  it("re-ranks ADP among ranked players, skipping those without ADP", () => {
    const ranks = adpRanks([ranked("A", 5, [], 30), ranked("B", 4, [], null), ranked("C", 3, [], 12)]);
    expect([...ranks]).toEqual([["C", 1], ["A", 2]]);
  });
});

describe("categoryRanks", () => {
  const p = (o: Partial<PoolPlayer>) => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, three_pm: 0, tov: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, ...o }) as PoolPlayer;

  it("ranks the user's team in each category, lower TO winning", () => {
    const teams = [
      [p({ pts: 20, tov: 1, fgm: 5, fga: 10 })], // slot 1: 50%
      [p({ pts: 30, tov: 3, fgm: 1, fga: 1 })], // slot 2: 100% on one shot
      [p({ pts: 10, tov: 2, fgm: 4, fga: 10 })],
    ];
    expect(categoryRanks(teams, 1, ["PTS", "TO", "FG%"])).toEqual([
      { category: "PTS", rank: 2, total: 20 },
      { category: "TO", rank: 1, total: 1 },
      { category: "FG%", rank: 2, total: 0.5 },
    ]);
  });

  it("shares a rank on ties", () => {
    const teams = [[p({ pts: 10 })], [p({ pts: 10 })]];
    expect(categoryRanks(teams, 2, ["PTS"])[0].rank).toBe(1);
  });
});
