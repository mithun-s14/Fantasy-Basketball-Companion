import { describe, it, expect } from "vitest";
import { NBA_TEAMS } from "@/lib/constants";

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
