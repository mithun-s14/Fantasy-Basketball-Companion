/**
 * In-memory sliding-window rate limiter.
 *
 * Each key (e.g. IP address) has a list of request timestamps.
 * On every call we drop timestamps older than `windowMs` and check
 * whether the remaining count exceeds `limit`.
 */

interface RateLimiterOptions {
  /** Maximum requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** How many requests remain before the key is throttled. */
  remaining: number;
  /** Unix ms timestamp when the oldest request in the window expires. */
  resetAt: number;
}

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly store = new Map<string, number[]>();

  constructor({ limit, windowMs }: RateLimiterOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = (this.store.get(key) ?? []).filter(
      (ts) => ts > windowStart
    );

    const allowed = timestamps.length < this.limit;

    if (allowed) {
      timestamps.push(now);
    }

    this.store.set(key, timestamps);

    const oldest = timestamps[0] ?? now;
    const resetAt = oldest + this.windowMs;

    return {
      allowed,
      remaining: Math.max(0, this.limit - timestamps.length),
      resetAt,
    };
  }

  /** Exposed for testing — clears all stored state. */
  reset() {
    this.store.clear();
  }
}

/** Shared limiter: 3 requests per minute per IP for the Gemini chat endpoint. */
export const chatRateLimiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
