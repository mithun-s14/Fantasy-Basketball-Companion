import { Registry, Counter, collectDefaultMetrics } from "prom-client";

// Module-level singleton — created once when the Next.js server process starts.
// Works correctly in standalone Docker mode (single long-running process).
// Would need a different approach in a true serverless/edge deployment where
// each invocation gets a fresh process and in-memory state is lost.
export const registry = new Registry();

// Guard against collectDefaultMetrics being called twice (e.g. hot reload in dev).
// Calling it twice throws, so we check the registry for existing metrics first.
if (registry.getMetricsAsArray().length === 0) {
  collectDefaultMetrics({ register: registry });
}

// Count page and API requests handled by the Next.js server.
export const webRequestsTotal = new Counter({
  name: "web_requests_total",
  help: "Total HTTP requests handled by the web service",
  labelNames: ["path", "status"] as const,
  registers: [registry],
});
