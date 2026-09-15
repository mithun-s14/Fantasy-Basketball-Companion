import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";

// One registry per process — shared across all imports of this module.
export const registry = new Registry();

// Default metrics: Node.js process CPU, memory, event loop lag, GC stats.
// Collected automatically every 10 seconds in the background.
collectDefaultMetrics({ register: registry });

// Total chat requests, labelled by outcome so we can compute error rate.
// Labels let you slice one counter into multiple dimensions.
// e.g. rate(chat_requests_total{status="error"}[5m])
export const chatRequestsTotal = new Counter({
  name: "chat_requests_total",
  help: "Total number of POST /chat requests",
  labelNames: ["status"] as const,   // "success" | "error" | "rate_limited"
  registers: [registry],
});

// Histogram of how long each Gemini call takes end-to-end (ms).
// Buckets are chosen to capture the range of typical LLM latencies.
// Histograms let Prometheus compute percentiles: P50, P95, P99.
export const chatLatencyMs = new Histogram({
  name: "chat_latency_ms",
  help: "End-to-end latency of POST /chat in milliseconds",
  buckets: [200, 500, 1000, 2000, 4000, 8000, 15000],
  registers: [registry],
});

// How often the rate limiter rejects a request.
// Useful for detecting abuse or legitimate traffic spikes.
export const rateLimitHitsTotal = new Counter({
  name: "rate_limit_hits_total",
  help: "Total number of requests rejected by the rate limiter",
  registers: [registry],
});
