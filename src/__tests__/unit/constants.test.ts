import { describe, it, expect } from "vitest";
import { NBA_TEAMS, currentSeason, previousSeason, bbrefSeasonYear, playerNameKey } from "@/lib/constants";

describe("NBA_TEAMS", () => {
  it("has exactly 30 teams", () => {
    expect(NBA_TEAMS).toHaveLength(30);
  });

  it("all entries are non-empty strings", () => {
    for (const team of NBA_TEAMS) {
      expect(typeof team).toBe("string");
      expect(team.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate entries", () => {
    const unique = new Set(NBA_TEAMS);
    expect(unique.size).toBe(NBA_TEAMS.length);
  });

  it("has no leading or trailing whitespace", () => {
    for (const team of NBA_TEAMS) {
      expect(team).toBe(team.trim());
    }
  });

  it("contains known teams", () => {
    expect(NBA_TEAMS).toContain("Los Angeles Lakers");
    expect(NBA_TEAMS).toContain("Boston Celtics");
    expect(NBA_TEAMS).toContain("Golden State Warriors");
  });
});

describe("currentSeason", () => {
  it("rolls over in October", () => {
    expect(currentSeason(new Date(2026, 8, 30))).toBe("2025-26");
    expect(currentSeason(new Date(2026, 9, 1))).toBe("2026-27");
    expect(currentSeason(new Date(2099, 11, 1))).toBe("2099-00");
  });

  it("steps back one season", () => {
    expect(previousSeason("2026-27")).toBe("2025-26");
    expect(previousSeason("2000-01")).toBe("1999-00");
  });

  it("maps to the Basketball-Reference end year", () => {
    expect(bbrefSeasonYear("2025-26")).toBe(2026);
  });
});

describe("playerNameKey", () => {
  it("matches spellings of the same player across sources", () => {
    const pairs = [
      ["Alperen Şengün", "Alperen Sengun"],
      ["Jimmy Butler", "Jimmy Butler III"],
      ["Terrence Shannon Jr.", "Terrence Shannon Jr"],
      ["A.J. Green", "AJ Green"],
      ["Tristan Da Silva", "Tristan da Silva"],
      ["Nikola Jokić", "Nikola Jokic"],
    ];
    for (const [a, b] of pairs) expect(playerNameKey(a)).toBe(playerNameKey(b));
  });

  it("keeps different players apart", () => {
    expect(playerNameKey("Jalen Williams")).not.toBe(playerNameKey("Jaylin Williams"));
  });
});
