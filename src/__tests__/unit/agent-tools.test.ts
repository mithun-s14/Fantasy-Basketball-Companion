import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: async () => null, get: mockGet, set: mockSet }) },
}));

import {
  getRecentPerformance,
  getRecentPerformanceCached,
  getRoster,
  getRosterCached,
} from "@/lib/agent/tools";
import { resetFlagCache } from "@/lib/agent/config";
import type { PlayerStats } from "@/lib/types";

const GREEN: PlayerStats = {
  id: "1",
  player_name: "Jalen Green",
  nba_team: "Houston Rockets",
  stat_type: "last10",
  pts: 21.3,
  reb: 5,
  ast: 3.4,
  stl: 1.1,
  blk: 0.4,
  tov: 2.6,
  three_pm: 3.2,
  fgm: 7.5,
  fga: 17,
  ftm: 3.1,
  fta: 3.8,
  updated_at: "2026-09-19T00:00:00Z",
};

/** Minimal Supabase stub: from().select().eq() and from().select().in() */
function supabaseStub(result: { data?: unknown; error?: { message: string } }) {
  const terminal = Promise.resolve(result);
  return {
    from: () => ({
      select: () => ({
        eq: () => terminal,
        in: () => terminal,
      }),
    }),
  } as never;
}

beforeEach(() => {
  resetFlagCache();
  mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue("OK");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("get_roster", () => {
  it("summarizes the roster with names and teams", async () => {
    const supabase = supabaseStub({
      data: [
        { player_name: "Jalen Green", nba_team: "Houston Rockets" },
        { player_name: "Nikola Jokić", nba_team: "Denver Nuggets" },
      ],
    });
    const { summary, players } = await getRoster(supabase, "user-1");
    expect(summary).toContain("2 players");
    expect(summary).toContain("Jalen Green (Houston Rockets)");
    expect(summary).toContain("Nikola Jokić (Denver Nuggets)");
    expect(players).toHaveLength(2);
  });

  it("says so when the roster is empty", async () => {
    const { summary, players } = await getRoster(supabaseStub({ data: [] }), "user-1");
    expect(summary).toContain("no players saved");
    expect(players).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = supabaseStub({ error: { message: "permission denied" } });
    await expect(getRoster(supabase, "user-1")).rejects.toThrow(/permission denied/);
  });

  it("returns the cached roster without querying again", async () => {
    mockGet.mockResolvedValue({ summary: "cached roster", players: [] });
    const result = await getRosterCached(supabaseStub({ data: [] }), "user-1");
    expect(result.summary).toBe("cached roster");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("caches a fresh roster read with the roster TTL", async () => {
    await getRosterCached(supabaseStub({ data: [] }), "user-1");
    expect(mockSet).toHaveBeenCalledWith(
      "agent:roster:user-1",
      expect.anything(),
      { ex: 60 }
    );
  });

  it("still returns a result when the cache itself fails", async () => {
    mockGet.mockRejectedValue(new Error("redis down"));
    mockSet.mockRejectedValue(new Error("redis down"));
    const result = await getRosterCached(supabaseStub({ data: [] }), "user-1");
    expect(result.summary).toContain("no players saved");
  });
});

describe("get_recent_performance", () => {
  const player = { name: "Jalen Green", team: "Houston Rockets" };

  it("reports last 10 alongside season, with shooting percentages", async () => {
    const season = { ...GREEN, stat_type: "season" as const, pts: 19.8 };
    const summary = await getRecentPerformance(supabaseStub({ data: [GREEN, season] }), [player]);
    expect(summary).toContain("last 10 21.3p");
    expect(summary).toContain("season 19.8p");
    expect(summary).toContain("FG 44.1%");
  });

  it("says when a player has no stats on file", async () => {
    const summary = await getRecentPerformance(supabaseStub({ data: [] }), [player]);
    expect(summary).toContain("no stats on file");
  });

  it("returns early when no players were resolved", async () => {
    const summary = await getRecentPerformance(supabaseStub({ data: [] }), []);
    expect(summary).toContain("No players were named");
  });

  it("throws when Supabase returns an error", async () => {
    const supabase = supabaseStub({ error: { message: "bad query" } });
    await expect(getRecentPerformance(supabase, [player])).rejects.toThrow(/bad query/);
  });

  it("caches under an order-independent key with the one hour TTL", async () => {
    await getRecentPerformanceCached(supabaseStub({ data: [GREEN] }), [
      { name: "Nikola Jokić", team: "Denver Nuggets" },
      player,
    ]);
    expect(mockSet).toHaveBeenCalledWith(
      "agent:perf:Jalen Green|Nikola Jokić",
      expect.anything(),
      { ex: 3600 }
    );
  });

  it("keeps a summary under the 2KB state budget", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Player ${i}`,
      team: "Houston Rockets",
    }));
    const summary = await getRecentPerformance(supabaseStub({ data: [] }), many);
    expect(summary.length).toBeLessThanOrEqual(2000);
  });
});
