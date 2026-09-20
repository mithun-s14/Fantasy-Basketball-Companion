import { experimental_evaluate, type Experimental_EvaluationModel } from "ai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getConfig, isJevAllowed } from "./config";
import { buildRouteQuestions, buildVerifyQuestions, routeState, verifyState } from "./questions";
import {
  ACTION_IDS,
  type ActionId,
  type AgentState,
  type DecisionEngine,
  type EngineName,
  type RouteDecision,
  type VerifyDecision,
  type VerifyInput,
} from "./types";

// This is the only module that calls experimental_evaluate, so a breaking
// change in the experimental API touches one file.

function isActionId(value: string): value is ActionId {
  return (ACTION_IDS as string[]).includes(value);
}

/** Builds an engine backed by an evaluation model (Jev or Gemini). */
export function evaluationEngine(
  name: EngineName,
  getModel: () => Experimental_EvaluationModel,
  providerOptions?: SharedV4ProviderOptions
): DecisionEngine {
  return {
    name,
    async route(state: AgentState): Promise<RouteDecision> {
      const started = Date.now();
      const result = await experimental_evaluate({
        model: getModel(),
        state: routeState(state),
        questions: buildRouteQuestions(),
        maxRetries: 1, // protect loop latency
        providerOptions,
      });

      const answer = result.answers.next_action;
      if (!isActionId(answer.choice)) {
        throw new Error(`${name} returned unknown action "${answer.choice}"`);
      }
      const confidence = result.providerMetadata?.typesafe?.confidence;

      return {
        action: answer.choice,
        probability: answer.probabilities?.[answer.choice] ?? null,
        confidence: typeof confidence === "number" ? confidence : null,
        engine: name,
        fellBack: false,
        latencyMs: Date.now() - started,
        totalTokens: result.usage.totalTokens ?? null,
      };
    },

    async verify(input: VerifyInput): Promise<VerifyDecision> {
      const started = Date.now();
      const result = await experimental_evaluate({
        model: getModel(),
        state: verifyState(input),
        questions: buildVerifyQuestions(),
        maxRetries: 1,
        providerOptions,
      });

      return {
        grounded: result.answers.grounded.probability,
        answersQuestion: result.answers.answers_question.probability,
        quality: result.answers.quality.score,
        engine: name,
        fellBack: false,
        latencyMs: Date.now() - started,
      };
    },
  };
}

export const jevEngine = (): DecisionEngine =>
  evaluationEngine("jev", () => "typesafe-ai/jev", {
    // The state can contain real user data
    gateway: { zeroDataRetention: true },
  });

export const geminiEngine = (): DecisionEngine => {
  // @ai-sdk/google defaults to GOOGLE_GENERATIVE_AI_API_KEY; this app stores
  // the key as GEMINI_API_KEY, the same one the Coach's LangChain call uses.
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return evaluationEngine("gemini", () => google.evaluationModel("gemini-2.5-flash"));
};

const PLAYER_WORDS = /\b(should i|start|sit|bench|trade|drop|pick ?up|add|stream)\b/i;
const SCHEDULE_WORDS = /\b(schedule|this week|next week|games?|back.?to.?back|b2b|matchup|opponent|streaming)\b/i;
const ROSTER_WORDS = /\b(my (team|roster|squad|guys)|our team)\b/i;
const TREND_WORDS = /\b(recent|lately|last 10|trending|slump|hot|cold|form|stats?|averaging)\b/i;

/**
 * Vague: a few words with no player, team, or schedule to act on. A capital
 * letter after the first word means a name worth looking up; "I" is not a name
 * and the first word is capitalized by habit, not by meaning.
 */
function isVague(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 5 || SCHEDULE_WORDS.test(message)) return false;
  return !words.slice(1).some((word) => /^[A-Z][a-z]/.test(word));
}

/** Deterministic, free, and the default fallback for every other engine. */
export const rulesEngine = (): DecisionEngine => ({
  name: "rules",
  async route(state: AgentState): Promise<RouteDecision> {
    const started = Date.now();
    const message = state.message;
    const done = new Set(state.steps.map((s) => s.action));
    let action: ActionId;

    if (state.steps.length >= 2) {
      action = "answer";
    } else if (isVague(message)) {
      action = "ask_user";
    } else if (
      ROSTER_WORDS.test(message) &&
      !state.rosterSummary &&
      !done.has("get_roster")
    ) {
      action = "get_roster";
    } else if (SCHEDULE_WORDS.test(message) && !done.has("get_matchup_stats")) {
      action = "get_matchup_stats";
    } else if (
      (TREND_WORDS.test(message) || PLAYER_WORDS.test(message)) &&
      !done.has("get_recent_performance")
    ) {
      action = "get_recent_performance";
    } else {
      action = "answer";
    }

    return {
      action,
      probability: null,
      confidence: null,
      engine: "rules",
      fellBack: false,
      latencyMs: Date.now() - started,
    };
  },

  // Rules cannot judge groundedness. It reports nothing rather than guessing.
  async verify(): Promise<VerifyDecision> {
    return {
      grounded: null,
      answersQuestion: null,
      quality: null,
      engine: "rules",
      fellBack: false,
      latencyMs: 0,
    };
  },
});

let jevBlockedWarned = false;

/**
 * Resolves an engine name to an implementation, enforcing the Jev cutoff.
 * Every Jev call path goes through here.
 */
export function getEngine(name: EngineName, now: Date = new Date()): DecisionEngine {
  if (name === "jev" && !isJevAllowed(now)) {
    if (!jevBlockedWarned) {
      console.warn(
        "[agent] Jev is blocked (past cutoff, missing AI_GATEWAY_API_KEY, or JEV_ALLOW_PAID unset) — using the fallback engine."
      );
      jevBlockedWarned = true;
    }
    return getEngine(getConfig().fallbackEngine, now);
  }
  if (name === "gemini") return geminiEngine();
  if (name === "jev") return jevEngine();
  return rulesEngine();
}

/** Test seam: lets the once-per-process warning be asserted more than once. */
export function resetJevWarning(): void {
  jevBlockedWarned = false;
}

/**
 * Routes with the configured engine, applying the probability threshold and
 * falling back on error. A decision engine failure never breaks a chat.
 */
export async function routeWithFallback(
  state: AgentState,
  now: Date = new Date()
): Promise<RouteDecision> {
  const config = getConfig();
  const primary = getEngine(config.routeEngine, now);
  const fallback = getEngine(config.fallbackEngine, now);

  let reason: string | null = null;
  try {
    const decision = await primary.route(state);
    if (
      decision.probability !== null &&
      decision.probability < config.routeMinProb
    ) {
      reason = `probability ${decision.probability} below ${config.routeMinProb}`;
    } else {
      return decision;
    }
  } catch (err) {
    reason = `${config.routeEngine} route failed: ${err}`;
  }

  console.warn("[agent] route fell back:", reason);
  const decision = await fallback.route(state);
  return { ...decision, fellBack: true };
}

/**
 * Verifies with the configured engine, falling back on error. Verification is
 * advisory: it runs after the answer has streamed and can only add a note.
 */
export async function verifyWithFallback(
  input: VerifyInput,
  now: Date = new Date()
): Promise<VerifyDecision> {
  const config = getConfig();
  if (config.verifyEngine === "off") {
    throw new Error("verification is off");
  }

  try {
    return await getEngine(config.verifyEngine, now).verify(input);
  } catch (err) {
    console.warn("[agent] verify fell back:", err);
    const decision = await getEngine(config.fallbackEngine, now).verify(input);
    return { ...decision, fellBack: true };
  }
}
