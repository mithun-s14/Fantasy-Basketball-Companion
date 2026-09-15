import { registry } from "@/lib/metrics";

// Prometheus scrapes this endpoint on the interval set in the ServiceMonitor.
// Returns all metrics in Prometheus text exposition format.
//
// In production you would protect this route (e.g. require a bearer token or
// restrict to cluster-internal IPs) so external clients can't read your metrics.
export async function GET() {
  const metrics = await registry.metrics();
  return new Response(metrics, {
    headers: { "Content-Type": registry.contentType },
  });
}
