import type { Experimental_EvaluationQuestion } from "ai";
import type { AgentState, VerifyInput } from "./types";

// Jev and Gemini must see identical questions so the eval compares engines fairly.

export function buildRouteQuestions() {
  return {
    next_action: {
      type: "choice",
      instructions:
        "Pick the single next step for a fantasy basketball assistant answering the user's message. Never pick a step whose information is already present in the state.",
      criteria: {
        get_roster:
          "The user's current roster is needed and is not already in the state.",
        get_recent_performance:
          "A player's recent stats or season-vs-last-10-games trend is needed and is not already in the state.",
        get_matchup_stats:
          "Games scheduled this week or opponent context is needed for a start, sit, or streaming decision.",
        answer:
          "The state already contains enough information to answer well.",
        ask_user:
          "The request is too vague to act on, such as no player or decision named.",
      },
    },
  } as const satisfies Record<string, Experimental_EvaluationQuestion>;
}

export function buildVerifyQuestions() {
  return {
    grounded: {
      type: "boolean",
      instructions:
        "Is every number in the draft answer supported by the tool results in the state?",
    },
    answers_question: {
      type: "boolean",
      instructions: "Does the draft directly answer what the user asked?",
    },
    quality: {
      type: "score",
      instructions: "Rate how useful the draft answer is to the user.",
      criteria: [
        "Wrong or unhelpful",
        "Partly useful",
        "Useful with a clear recommendation",
      ],
    },
  } as const satisfies Record<string, Experimental_EvaluationQuestion>;
}

/** Compact JSON state. Jev's context window is 32K tokens, so keep it small. */
export function routeState(state: AgentState) {
  return {
    message: state.message,
    roster: state.rosterSummary ?? null,
    steps: state.steps.map((s) => ({
      action: s.action,
      result: s.resultSummary,
    })),
    stepCount: state.stepCount,
  };
}

export function verifyState(input: VerifyInput) {
  return {
    message: input.message,
    toolResults: input.resultSummaries,
    draft: input.draft,
  };
}
