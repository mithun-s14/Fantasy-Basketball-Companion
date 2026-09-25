import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

const { mockInsert } = vi.hoisted(() => ({ mockInsert: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: async () => null }) },
}));

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => ({ from: () => ({ insert: mockInsert }) }),
}));

import { logDecision, newRequestId } from "@/lib/agent/log";
import { refreshFlags, resetFlagCache } from "@/lib/agent/config";

const ROUTE_DECISION = {
  action: "get_roster" as const,
  probability: 0.82,
  confidence: 0.91,
  engine: "jev" as const,
  fellBack: false,
  latencyMs: 42,
};

const VERIFY_DECISION = {
  grounded: 0.4,
  answersQuestion: 0.9,
  quality: 1.5,
  engine: "gemini" as const,
  fellBack: false,
  latencyMs: 17,
};

const base = {
  requestId: "req-1",
  userId: "user-1",
  step: 0,
  message: "How does my team look?",
};

beforeEach(async () => {
  resetFlagCache();
  delete process.env.LOG_DECISION_STATE;
  mockInsert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await refreshFlags();
});

afterEach(() => {
  delete process.env.LOG_DECISION_STATE;
  vi.restoreAllMocks();
});

describe("logDecision", () => {
  it("writes a route row with the engine's numbers", async () => {
    await logDecision({ ...base, decision: ROUTE_DECISION, probabilities: { get_roster: 0.82 } });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: "req-1",
        decision_point: "route",
        engine: "jev",
        action: "get_roster",
        confidence: 0.91,
        latency_ms: 42,
        fell_back: false,
        is_shadow: false,
      })
    );
  });

  it("writes a verify row with no action", async () => {
    await logDecision({ ...base, decision: VERIFY_DECISION });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ decision_point: "verify", action: null, engine: "gemini" })
    );
  });

  it("stores a hash of the message and no raw text by default", async () => {
    await logDecision({ ...base, decision: ROUTE_DECISION });
    const row = mockInsert.mock.calls[0][0];
    expect(row.message_text).toBeNull();
    expect(row.message_hash).toBe(
      createHash("sha256").update(base.message).digest("hex")
    );
  });

  it("stores the raw message only when LOG_DECISION_STATE is true", async () => {
    process.env.LOG_DECISION_STATE = "true";
    await refreshFlags();
    await logDecision({ ...base, decision: ROUTE_DECISION });
    expect(mockInsert.mock.calls[0][0].message_text).toBe(base.message);
  });

  it("marks shadow rows", async () => {
    await logDecision({ ...base, decision: ROUTE_DECISION, isShadow: true });
    expect(mockInsert.mock.calls[0][0].is_shadow).toBe(true);
  });

  it("never throws when the insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "table missing" } });
    await expect(logDecision({ ...base, decision: ROUTE_DECISION })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("never throws when Supabase is unreachable", async () => {
    mockInsert.mockRejectedValue(new Error("network down"));
    await expect(logDecision({ ...base, decision: ROUTE_DECISION })).resolves.toBeUndefined();
  });

  it("issues a unique request id per request", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
