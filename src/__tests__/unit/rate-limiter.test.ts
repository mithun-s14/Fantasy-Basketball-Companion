import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/lib/rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    const result = limiter.check("ip1");
    expect(result.allowed).toBe(false);
  });

  it("returns correct remaining count", () => {
    expect(limiter.check("ip1").remaining).toBe(2);
    expect(limiter.check("ip1").remaining).toBe(1);
    expect(limiter.check("ip1").remaining).toBe(0);
    // over the limit — remaining stays 0
    expect(limiter.check("ip1").remaining).toBe(0);
  });

  it("isolates different keys", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    // ip1 is throttled, ip2 is untouched
    expect(limiter.check("ip1").allowed).toBe(false);
    expect(limiter.check("ip2").allowed).toBe(true);
  });

  it("allows requests again after the window expires", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    // Advance time past the 60 s window
    vi.advanceTimersByTime(60_001);

    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("returns resetAt within the window duration of the first request", () => {
    const before = Date.now();
    const result = limiter.check("ip1");
    const after = Date.now();

    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 60_000);
  });

  it("reset() clears all stored state", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.reset();
    expect(limiter.check("ip1").allowed).toBe(true);
  });
});
