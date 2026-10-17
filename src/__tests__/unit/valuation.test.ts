import { describe, it, expect } from "vitest";
import { rankPlayers, availability, assignTiers, type PoolPlayer } from "@/lib/valuation";
import type { Category } from "@/lib/league";

function player(name: string, overrides: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    name,
    team: "Boston Celtics",
    positions: ["SF"],
    gp: 82,
    gpWindow: 164,
    seasonsInWindow: 2,
    pts: 15,
    reb: 5,
    ast: 3,
    stl: 1,
    blk: 0.5,
    three_pm: 1.5,
    tov: 2,
    fgm: 6,
    fga: 13,
    ftm: 2,
    fta: 2.5,
    adp: null,
    ...overrides,
  };
}

const byName = (ranked: ReturnType<typeof rankPlayers>, name: string) => ranked.find((r) => r.player.name === name)!;

// Deterministic spread of players so the pool is bigger than teams × roster.
function bigPool(count: number): PoolPlayer[] {
  return Array.from({ length: count }, (_, i) =>
    player(`P${i}`, {
      pts: 8 + ((i * 7) % 23),
      reb: 2 + ((i * 5) % 11),
      ast: 1 + ((i * 3) % 9),
      stl: 0.4 + ((i * 2) % 7) / 5,
      blk: 0.2 + ((i * 3) % 8) / 5,
      three_pm: (i * 4) % 5,
      tov: 1 + (i % 4),
      fgm: 4 + (i % 6),
      fga: 9 + (i % 8),
      ftm: 1 + (i % 5),
      fta: 1.5 + (i % 5) * 1.1,
    })
  );
}

describe("rankPlayers", () => {
  it("matches hand-computed z-scores on a small pool", () => {
    const pool = [player("A", { pts: 10 }), player("B", { pts: 20 }), player("C", { pts: 30 })];
    const ranked = rankPlayers(pool, { teamCount: 1, rosterSize: 3, categories: ["PTS"] });
    // mean 20, population SD sqrt(200/3)
    const sd = Math.sqrt(200 / 3);
    expect(byName(ranked, "C").z.PTS).toBeCloseTo(10 / sd, 6);
    expect(byName(ranked, "B").z.PTS).toBeCloseTo(0, 6);
    expect(byName(ranked, "A").z.PTS).toBeCloseTo(-10 / sd, 6);
    expect(ranked.map((r) => r.player.name)).toEqual(["C", "B", "A"]);
  });

  it("values a high-volume 52% shooter above a low-volume 60% shooter", () => {
    const pool = [
      player("Low volume 60%", { fgm: 1.2, fga: 2 }),
      player("High volume 52%", { fgm: 10.4, fga: 20 }),
      player("Average", { fgm: 4.5, fga: 10 }),
    ];
    const ranked = rankPlayers(pool, { teamCount: 1, rosterSize: 3, categories: ["FG%"] });
    expect(byName(ranked, "High volume 52%").z["FG%"]!).toBeGreaterThan(byName(ranked, "Low volume 60%").z["FG%"]!);
  });

  it("scores fewer turnovers higher", () => {
    const pool = [player("Careful", { tov: 1 }), player("Sloppy", { tov: 4 }), player("Mid", { tov: 2.5 })];
    const ranked = rankPlayers(pool, { teamCount: 1, rosterSize: 3, categories: ["TO"] });
    expect(byName(ranked, "Careful").z.TO!).toBeGreaterThan(0);
    expect(byName(ranked, "Sloppy").z.TO!).toBeLessThan(0);
  });

  it("punting FT% lifts a poor free-throw shooter and re-centers the other categories", () => {
    const pool = [...bigPool(60), player("Brick big", { reb: 12, blk: 2, pts: 14, ftm: 1.5, fta: 5 })];
    const categories: Category[] = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"];
    const opts = { teamCount: 4, rosterSize: 5, categories };
    const before = byName(rankPlayers(pool, opts), "Brick big").rank;
    const punted = rankPlayers(pool, { ...opts, punts: ["FT%"] });
    expect(byName(punted, "Brick big").rank).toBeLessThan(before);
    expect(punted[0].z["FT%"]).toBeUndefined();

    // A punt drops the category from the pool's averages too: identical to a
    // league that never counted FT%, and different from the unpunted z-scores.
    const without = rankPlayers(pool, { ...opts, categories: categories.filter((c) => c !== "FT%") });
    const unpunted = rankPlayers(pool, opts);
    let changed = false;
    for (const r of punted) {
      expect(r.z).toEqual(byName(without, r.player.name).z);
      if (r.z.REB !== byName(unpunted, r.player.name).z.REB) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("puts replacement level near rank n + 5", () => {
    const pool = Array.from({ length: 60 }, (_, i) => player(`P${i}`, { pts: i + 1 }));
    const ranked = rankPlayers(pool, { teamCount: 4, rosterSize: 5, categories: ["PTS"] });
    expect(Math.abs(ranked[24].value)).toBeLessThan(0.1 * ranked[0].value);
  });

  it("ranks low-GP players but leaves them out of the averages", () => {
    const pool = [...bigPool(30), player("Small sample", { gp: 5, gpWindow: 5, seasonsInWindow: 1, pts: 99 })];
    const opts = { teamCount: 2, rosterSize: 10, categories: ["PTS"] as Category[] };
    const ranked = rankPlayers(pool, opts);
    const withoutHim = rankPlayers(pool.slice(0, 30), opts);
    expect(byName(ranked, "Small sample").lowGp).toBe(true);
    // Same model either way, so everyone else's z is unchanged.
    expect(byName(ranked, "P3").z.PTS).toBeCloseTo(byName(withoutHim, "P3").z.PTS!, 9);
  });

  it("discounts value by availability but keeps the per-game value", () => {
    const pool = [...bigPool(30), player("Fragile star", { pts: 40, gpWindow: 82 })];
    const ranked = rankPlayers(pool, { teamCount: 2, rosterSize: 10, categories: ["PTS"] });
    const star = byName(ranked, "Fragile star");
    expect(star.availability).toBe(0.5);
    expect(star.value).toBeCloseTo(star.perGameValue * 0.5, 9);
  });
});

describe("availability", () => {
  it("caps at 1", () => {
    expect(availability(player("Iron man", { gpWindow: 170, seasonsInWindow: 2 }))).toBe(1);
  });

  it("uses one season as the denominator for a player with one season of data", () => {
    expect(availability(player("Rookie", { gpWindow: 41, seasonsInWindow: 1 }))).toBe(0.5);
    expect(availability(player("Vet", { gpWindow: 41, seasonsInWindow: 2 }))).toBe(0.25);
  });
});

describe("assignTiers", () => {
  it("breaks tiers at large gaps", () => {
    expect(assignTiers([10, 9.9, 9.8, 7, 6.9, 6.8, 6.7])).toEqual([1, 1, 1, 2, 2, 2, 2]);
  });

  it("caps a tier at 12 players", () => {
    const evenlySpaced = Array.from({ length: 30 }, (_, i) => 100 - i * 0.5);
    const tiers = assignTiers(evenlySpaced);
    const sizes = Object.values(tiers.reduce<Record<number, number>>((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {}));
    expect(sizes).toEqual([12, 12, 6]);
  });
});
