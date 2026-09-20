import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRoute, mockLog, mockRoster, mockPerf } = vi.hoisted(() => ({
  mockRoute: vi.fn(),
  mockLog: vi.fn(),
  mockRoster: vi.fn(),
  mockPerf: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: async () => null }) },
}));

vi.mock("@/lib/agent/engines", () => ({ routeWithFallback: mockRoute }));
vi.mock("@/lib/agent/log", () => ({ logDecision: mockLog, newRequestId: () => "req-1" }));
vi.mock("@/lib/agent/tools", () => ({
  getRosterCached: mockRoster,
  getRecentPerformanceCached: mockPerf,
}));

import { runAgentLoop } from "@/lib/agent/loop";
import { refreshFlags, resetFlagCache } from "@/lib/agent/config";
import type { ActionId } from "@/lib/agent/types";

const ACTIVE = [{ name: "Jalen Green", team: "Houston Rockets" }];
const ENV_KEYS = ["MAX_AGENT_STEPS", "AGENT_LOOP_TIMEOUT_MS"];

function decision(action: ActionId) {
  return {
    action,
    probability: null,
    confidence: null,
    engine: "rules" as const,
    fellBack: false,
    latencyMs: 1,
  };
}

function run(message: string, userId: string | null = "user-1", onStep?: (a: ActionId) => void) {
  return runAgentLoop({
    message,
    supabase: {} as never,
    userId,
    requestId: "req-1",
    activePlayers: ACTIVE,
    onStep,
  });
}

beforeEach(async () => {
  resetFlagCache();
  for (const key of ENV_KEYS) delete process.env[key];
  mockRoute.mockReset();
  mockLog.mockReset();
  mockRoster.mockReset().mockResolvedValue({
    summary: "The user's roster (1 players): Jalen Green (Houston Rockets).",
    players: ACTIVE,
  });
  mockPerf.mockReset().mockResolvedValue("Jalen Green (Houston Rockets): last 10 21.3p/5.1r/3.4a");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await refreshFlags();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

describe("the agent loop", () => {
  it("runs a tool, then answers", async () => {
    mockRoute
      .mockResolvedValueOnce(decision("get_roster"))
      .mockResolvedValueOnce(decision("answer"));

    const steps: ActionId[] = [];
    const result = await run("How does my team look?", "user-1", (a) => steps.push(a));

    expect(steps).toEqual(["get_roster"]);
    expect(result.clarify).toBe(false);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toContain("Jalen Green");
  });

  it("respects the step cap", async () => {
    process.env.MAX_AGENT_STEPS = "2";
    await refreshFlags();
    // Alternating tools so the repeat guard never fires first
    mockRoute
      .mockResolvedValueOnce(decision("get_roster"))
      .mockResolvedValueOnce(decision("get_recent_performance"))
      .mockResolvedValue(decision("get_roster"));

    const result = await run("How is Jalen Green doing for my team?");
    expect(result.steps).toHaveLength(2);
    expect(mockRoute).toHaveBeenCalledTimes(2);
  });

  it("stops when the same tool would run twice with the same arguments", async () => {
    mockRoute.mockResolvedValue(decision("get_recent_performance"));
    const result = await run("How is Jalen Green doing?");
    expect(result.steps).toHaveLength(1);
    expect(mockPerf).toHaveBeenCalledTimes(1);
  });

  it("respects the time budget", async () => {
    process.env.AGENT_LOOP_TIMEOUT_MS = "0";
    await refreshFlags();
    mockRoute.mockResolvedValue(decision("get_roster"));

    const result = await run("How does my team look?");
    expect(result.steps).toHaveLength(0);
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("ends the turn on ask_user", async () => {
    mockRoute.mockResolvedValue(decision("ask_user"));
    const result = await run("help");
    expect(result.clarify).toBe(true);
    expect(result.steps).toHaveLength(0);
  });

  it("asks the user when a stats tool has no player to look up", async () => {
    mockRoute.mockResolvedValue(decision("get_recent_performance"));
    const result = await runAgentLoop({
      message: "who should i start?",
      supabase: {} as never,
      userId: "user-1",
      requestId: "req-1",
      activePlayers: ACTIVE,
    });
    expect(result.clarify).toBe(true);
    expect(mockPerf).not.toHaveBeenCalled();
  });

  it("records that a signed-out user has no roster instead of failing", async () => {
    mockRoute
      .mockResolvedValueOnce(decision("get_roster"))
      .mockResolvedValueOnce(decision("answer"));
    const result = await run("How does my team look?", null);
    expect(mockRoster).not.toHaveBeenCalled();
    expect(result.summaries[0]).toContain("not signed in");
  });

  it("keeps going when a tool throws", async () => {
    mockRoster.mockRejectedValue(new Error("supabase down"));
    mockRoute
      .mockResolvedValueOnce(decision("get_roster"))
      .mockResolvedValueOnce(decision("answer"));

    const result = await run("How does my team look?");
    expect(result.clarify).toBe(false);
    expect(result.summaries[0]).toContain("unavailable");
  });

  it("logs every routing decision", async () => {
    mockRoute
      .mockResolvedValueOnce(decision("get_roster"))
      .mockResolvedValueOnce(decision("answer"));
    await run("How does my team look?");
    expect(mockLog).toHaveBeenCalledTimes(2);
    expect(mockLog.mock.calls[0][0]).toMatchObject({ requestId: "req-1", step: 0 });
  });

  it("answers rather than stalling on a tool that is not built yet", async () => {
    mockRoute.mockResolvedValue(decision("get_matchup_stats"));
    const result = await run("Who plays four games this week?");
    expect(result.steps).toHaveLength(0);
    expect(result.clarify).toBe(false);
  });
});
