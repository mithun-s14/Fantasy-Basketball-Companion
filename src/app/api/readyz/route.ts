import { NextResponse } from "next/server";

// Readiness probe: "is this instance ready to serve traffic?"
// Kubernetes stops routing to the pod if this fails, without restarting it.
//
// Intentionally lightweight for the K8s demo — just checks the server is up.
// In a production setup you would add an external connectivity check here,
// e.g. a cheap Supabase query, but that makes local kind clusters fragile
// because the probe timeout (1s) can be shorter than a cold Supabase round-trip.
export function GET() {
  return NextResponse.json({ status: "ready" });
}
