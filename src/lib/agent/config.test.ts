import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockHgetall } = vi.hoisted(() => ({ mockHgetall: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: mockHgetall }) },
}));

import {
  FLAG_DEFAULTS,
  getConfig,
  isJevAllowed,
  refreshFlags,
  resetFlagCache,
} from "@/lib/agent/config";

const FLAG_ENV = [
  "AGENT_MODE",
  "DECISION_ENGINE",
  "DECISION_ENGINE_ROUTE",
  "DECISION_ENGINE_VERIFY",
  "DECISION_FALLBACK",
  "JEV_ALLOW_PAID",
  "JEV_CUTOFF",
  "ROUTE_MIN_PROB",
  "AI_GATEWAY_API_KEY",
];

beforeEach(() => {
  resetFlagCache();
  mockHgetall.mockReset();
  mockHgetall.mockResolvedValue(null);
  for (const key of FLAG_ENV) delete process.env[key];
});

afterEach(() => {
  for (const key of FLAG_ENV) delete process.env[key];
});

describe("flag resolution", () => {
  it("falls back to defaults when nothing is set", async () => {
    await refreshFlags();
    const config = getConfig();
    expect(config.agentMode).toBe("off");
    expect(config.routeEngine).toBe("rules");
    expect(config.routeMinProb).toBe(Number(FLAG_DEFAULTS.ROUTE_MIN_PROB));
  });

  it("lets env beat the default", async () => {
    process.env.DECISION_ENGINE = "gemini";
    process.env.AGENT_MODE = "on";
    await refreshFlags();
    expect(getConfig().routeEngine).toBe("gemini");
    expect(getConfig().agentMode).toBe("on");
  });

  it("lets Redis beat env", async () => {
    process.env.DECISION_ENGINE = "gemini";
    mockHgetall.mockResolvedValue({ DECISION_ENGINE: "jev" });
    await refreshFlags();
    expect(getConfig().routeEngine).toBe("jev");
  });

  it("applies a per-capability override over the base engine", async () => {
    mockHgetall.mockResolvedValue({
      DECISION_ENGINE: "jev",
      DECISION_ENGINE_VERIFY: "off",
    });
    await refreshFlags();
    expect(getConfig().routeEngine).toBe("jev");
    expect(getConfig().verifyEngine).toBe("off");
  });

  it("ignores an unknown engine name rather than breaking chat", async () => {
    mockHgetall.mockResolvedValue({ DECISION_ENGINE: "not-an-engine" });
    await refreshFlags();
    expect(getConfig().routeEngine).toBe("rules");
  });

  it("caches the Redis read for 30 seconds", async () => {
    mockHgetall.mockResolvedValue({ DECISION_ENGINE: "jev" });
    const start = 1_000_000;
    await refreshFlags(start);
    await refreshFlags(start + 29_000);
    expect(mockHgetall).toHaveBeenCalledTimes(1);

    mockHgetall.mockResolvedValue({ DECISION_ENGINE: "gemini" });
    await refreshFlags(start + 31_000);
    expect(mockHgetall).toHaveBeenCalledTimes(2);
    expect(getConfig().routeEngine).toBe("gemini");
  });

  it("keeps the last known flags when Redis fails", async () => {
    mockHgetall.mockResolvedValue({ DECISION_ENGINE: "gemini" });
    await refreshFlags(0);
    mockHgetall.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshFlags(60_000);
    expect(getConfig().routeEngine).toBe("gemini");
  });
});

describe("the Jev cutoff guard", () => {
  const before = new Date("2026-09-24T23:59:59Z");
  const at = new Date("2026-09-25T00:00:00Z");
  const after = new Date("2026-10-01T00:00:00Z");

  it("allows Jev before the cutoff when a gateway key exists", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    await refreshFlags();
    expect(isJevAllowed(before)).toBe(true);
  });

  it("blocks Jev at and after the cutoff", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    await refreshFlags();
    expect(isJevAllowed(at)).toBe(false);
    expect(isJevAllowed(after)).toBe(false);
  });

  it("blocks Jev when the gateway key is missing", async () => {
    await refreshFlags();
    expect(isJevAllowed(before)).toBe(false);
  });

  it("bypasses the cutoff only with JEV_ALLOW_PAID", async () => {
    process.env.JEV_ALLOW_PAID = "true";
    await refreshFlags();
    expect(isJevAllowed(after)).toBe(true);
  });

  it("honours a JEV_ALLOW_PAID override set through Redis", async () => {
    mockHgetall.mockResolvedValue({ JEV_ALLOW_PAID: "true" });
    await refreshFlags();
    expect(isJevAllowed(after)).toBe(true);
  });
});
