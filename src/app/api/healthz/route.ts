import { NextResponse } from "next/server";

// Liveness probe: "is the process alive?"
// Kubernetes restarts the pod if this fails.
// Keeps it trivially simple — if the process is dead, it can't respond.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
