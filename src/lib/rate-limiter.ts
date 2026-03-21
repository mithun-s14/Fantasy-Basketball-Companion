import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Redis-backed sliding window rate limiter.
 *
 * How it works:
 *   Each IP address gets a sorted set in Redis where every request is stored
 *   as an entry with its timestamp as the score. On each incoming request:
 *     1. Entries older than the window (60s) are removed
 *     2. The remaining count is checked against the limit
 *     3. If allowed, a new entry is added — all atomically via a Lua script
 *
 * Why Redis instead of in-memory:
 *   Next.js API routes run as serverless functions. Multiple instances can
 *   run simultaneously, each with their own memory — so an in-memory Map
 *   would give each instance its own separate limit, making the limit
 *   ineffective. Redis is a shared external store that all instances read
 *   from, so the limit is enforced globally.
 *
 * Why Upstash:
 *   Traditional Redis requires a persistent TCP connection, which doesn't
 *   work well in serverless environments that spin up and down per request.
 *   Upstash exposes Redis over HTTP, making it compatible with Vercel and
 *   any serverless platform.
 */

const redis = Redis.fromEnv();
// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// from your environment variables automatically.

export const chatRateLimiter = new Ratelimit({
  redis,
  // Sliding window: allows `limit` requests per `window`, smoothly.
  // Unlike a fixed window (which resets at a hard boundary and can allow
  // a burst of 2x limit at window edges), sliding window tracks the exact
  // timestamps of the last N requests.
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  prefix: "fantasy_chat", // namespaces the Redis keys for this limiter
});

/**
 * Usage in an API route:
 *
 *   const ip = request.headers.get("x-forwarded-for") ?? "unknown";
 *   const { success, remaining, reset } = await chatRateLimiter.limit(ip);
 *
 *   if (!success) {
 *     return new Response("Too many requests", { status: 429 });
 *   }
 */
