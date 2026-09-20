import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config";
import { getEngine, routeWithFallback } from "./engines";
import { logDecision } from "./log";
import { argsKey, resolvePlayers, type PlayerRef } from "./args";
import {
  getMatchupStatsCached,
  getRecentPerformanceCached,
  getRosterCached,
} from "./tools";
import type { ActionId, AgentState } from "./types";

export interface LoopInput {
  message: string;
  supabase: SupabaseClient;
  userId: string | null;
  requestId: string;
  activePlayers: PlayerRef[];
  onStep?: (action: ActionId) => void;
}

export interface LoopResult {
  summaries: string[];
  clarify: boolean;
  steps: { action: ActionId; resultSummary: string }[];
}

/**
 * Picks a tool, runs it, repeats. Stops on `answer`, `ask_user`, a repeated
 * call, the step cap, or the time budget. Whatever was gathered is returned
 * either way so the Coach can always answer.
 */
export async function runAgentLoop({
  message,
  supabase,
  userId,
  requestId,
  activePlayers,
  onStep,
}: LoopInput): Promise<LoopResult> {
  const config = getConfig();
  const startedAt = Date.now();

  const state: AgentState = { message, steps: [], stepCount: 0 };
  let rosterPlayers: PlayerRef[] = [];
  const ranKeys = new Set<string>();

  while (
    state.stepCount < config.maxAgentSteps &&
    Date.now() - startedAt < config.loopTimeoutMs
  ) {
    // Shadow runs the same decision on a second engine for logging only. It is
    // started before the primary is awaited so it costs no extra latency, and
    // its answer never reaches the loop.
    if (config.shadowEngine !== "off") {
      const snapshot: AgentState = { ...state, steps: [...state.steps] };
      const step = state.stepCount;
      void getEngine(config.shadowEngine)
        .route(snapshot)
        .then((shadow) =>
          logDecision({ requestId, userId, step, message, decision: shadow, isShadow: true })
        )
        .catch((err) => console.warn("[agent] shadow route failed:", err));
    }

    const decision = await routeWithFallback(state);
    void logDecision({
      requestId,
      userId,
      step: state.stepCount,
      message,
      decision,
    });

    if (decision.action === "answer") break;
    if (decision.action === "ask_user") {
      return { summaries: state.steps.map((s) => s.resultSummary), clarify: true, steps: state.steps };
    }

    const players =
      decision.action === "get_roster"
        ? []
        : resolvePlayers(message, activePlayers, rosterPlayers);

    // A tool that needs a player but has none is a question for the user.
    // Matchup stats still work without one: they fall back to league-wide counts.
    if (decision.action === "get_recent_performance" && players.length === 0) {
      return { summaries: state.steps.map((s) => s.resultSummary), clarify: true, steps: state.steps };
    }

    const key = `${decision.action}:${argsKey(players)}`;
    if (ranKeys.has(key)) break;
    ranKeys.add(key);

    onStep?.(decision.action);

    try {
      if (decision.action === "get_roster") {
        if (!userId) {
          state.steps.push({
            action: "get_roster",
            resultSummary: "The user is not signed in, so no roster is available.",
          });
        } else {
          const roster = await getRosterCached(supabase, userId);
          rosterPlayers = roster.players;
          state.rosterSummary = roster.summary;
          state.steps.push({ action: "get_roster", resultSummary: roster.summary });
        }
      } else if (decision.action === "get_matchup_stats") {
        const summary = await getMatchupStatsCached(players.map((p) => p.team));
        state.steps.push({ action: "get_matchup_stats", resultSummary: summary });
      } else {
        const summary = await getRecentPerformanceCached(supabase, players);
        state.steps.push({ action: "get_recent_performance", resultSummary: summary });
      }
    } catch (err) {
      // A tool failure is not a dead chat, it is one less fact to answer with
      console.warn(`[agent] tool ${decision.action} failed:`, err);
      state.steps.push({
        action: decision.action,
        resultSummary: `${decision.action} was unavailable.`,
      });
    }

    state.stepCount += 1;
  }

  return {
    summaries: state.steps.map((s) => s.resultSummary),
    clarify: false,
    steps: state.steps,
  };
}
