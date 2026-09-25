import { createHash, randomUUID } from "crypto";
import { createServerSupabaseClient } from "../supabase";
import { getConfig } from "./config";
import type { RouteDecision, VerifyDecision } from "./types";

// Decisions are logged for calibration. Failing to log never breaks a chat.

export function newRequestId(): string {
  return randomUUID();
}

function hash(message: string): string {
  return createHash("sha256").update(message).digest("hex");
}

interface LogInput {
  requestId: string;
  userId: string | null;
  step: number;
  message: string;
  decision: RouteDecision | VerifyDecision;
  isShadow?: boolean;
  probabilities?: Record<string, number> | null;
  fallbackReason?: string | null;
}

export async function logDecision({
  requestId,
  userId,
  step,
  message,
  decision,
  isShadow = false,
  probabilities = null,
  fallbackReason = null,
}: LogInput): Promise<void> {
  const config = getConfig();
  const isRoute = "action" in decision;

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("agent_decisions").insert({
      request_id: requestId,
      user_id: userId,
      step,
      decision_point: isRoute ? "route" : "verify",
      engine: decision.engine,
      is_shadow: isShadow,
      action: isRoute ? decision.action : null,
      probabilities,
      confidence: isRoute ? decision.confidence : null,
      latency_ms: decision.latencyMs,
      fell_back: decision.fellBack,
      fallback_reason: fallbackReason,
      message_hash: hash(message),
      message_text: config.logDecisionState ? message : null,
    });
    if (error) console.warn("[agent] decision log insert failed:", error.message);
  } catch (err) {
    console.warn("[agent] decision log unavailable:", err);
  }
}
