import { describe, it, expect } from "vitest";
import { argsKey, resolvePlayers } from "@/lib/agent/args";

const ACTIVE = [
  { name: "Shai Gilgeous-Alexander", team: "Oklahoma City Thunder" },
  { name: "Jalen Green", team: "Houston Rockets" },
  { name: "Jalen Brunson", team: "New York Knicks" },
  { name: "Nikola Jokić", team: "Denver Nuggets" },
  { name: "Alperen Sengun", team: "Houston Rockets" },
];

const ROSTER = [{ name: "Alperen Sengun", team: "Houston Rockets" }];

describe("resolvePlayers", () => {
  it("matches a full name regardless of case", () => {
    const found = resolvePlayers("should i start jalen green tonight?", ACTIVE);
    expect(found.map((p) => p.name)).toEqual(["Jalen Green"]);
  });

  it("matches an unambiguous last name", () => {
    const found = resolvePlayers("Is Jokić playing?", ACTIVE);
    expect(found.map((p) => p.name)).toEqual(["Nikola Jokić"]);
  });

  it("does not guess on an ambiguous first name", () => {
    // Two players named Jalen, so the bare first name resolves nobody
    const found = resolvePlayers("what about Jalen?", ACTIVE, []);
    expect(found).toEqual([]);
  });

  it("matches initials like SGA", () => {
    const found = resolvePlayers("Is SGA worth a trade?", ACTIVE);
    expect(found.map((p) => p.name)).toEqual(["Shai Gilgeous-Alexander"]);
  });

  it("matches several named players at once", () => {
    const found = resolvePlayers("Jalen Green or Jalen Brunson this week?", ACTIVE);
    expect(found.map((p) => p.name).sort()).toEqual(["Jalen Brunson", "Jalen Green"]);
  });

  it("falls back to the roster when no player is named", () => {
    const found = resolvePlayers("who should i start?", ACTIVE, ROSTER);
    expect(found).toEqual(ROSTER);
  });

  it("resolves nobody when no player is named and the roster is empty", () => {
    expect(resolvePlayers("who should i start?", ACTIVE, [])).toEqual([]);
  });

  it("builds a stable key regardless of order", () => {
    const a = argsKey([ACTIVE[1], ACTIVE[2]]);
    const b = argsKey([ACTIVE[2], ACTIVE[1]]);
    expect(a).toBe(b);
  });
});
