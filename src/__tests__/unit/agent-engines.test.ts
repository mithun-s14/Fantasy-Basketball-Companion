import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Experimental_EvaluationMockModelV4 } from "ai/test";
import type { Experimental_EvaluationModelV4Result } from "@ai-sdk/provider";

const { mockHgetall, mockDoEvaluate } = vi.hoisted(() => ({
  mockHgetall: vi.fn(),
  mockDoEvaluate: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: mockHgetall }) },
}));

// The Gemini engine is the one we can exercise end to end without a network
// call: every evaluation goes through this mock model.
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({
    evaluationModel: () =>
      new Experimental_EvaluationMockModelV4({
        supportedQuestionTypes: ["choice", "score", "boolean"],
        doEvaluate: mockDoEvaluate,
      }),
  }),
}));

import {
  evaluationEngine,
  getEngine,
  resetJevWarning,
  routeWithFallback,
  rulesEngine,
} from "@/lib/agent/engines";
import { refreshFlags, resetFlagCache } from "@/lib/agent/config";
import type { AgentState } from "@/lib/agent/types";

const ENV_KEYS = [
  "DECISION_ENGINE",
  "DECISION_ENGINE_ROUTE",
  "DECISION_FALLBACK",
  "ROUTE_MIN_PROB",
  "JEV_ALLOW_PAID",
  "AI_GATEWAY_API_KEY",
];

function state(message: string, overrides: Partial<AgentState> = {}): AgentState {
  return { message, steps: [], stepCount: 0, ...overrides };
}

/** A full distribution over the five actions, as the SDK requires. */
function distribution(
  weights: Partial<Record<string, number>>
): Record<string, number> {
  return {
    get_roster: 0,
    get_recent_performance: 0,
    get_matchup_stats: 0,
    answer: 0,
    ask_user: 0,
    ...weights,
  };
}

function evaluationResult(
  answers: Record<string, unknown>,
  providerMetadata?: Record<string, Record<string, unknown>>
) {
  return { answers, providerMetadata, warnings: [] } as unknown as Experimental_EvaluationModelV4Result;
}

function mockModel(
  answers: Record<string, unknown>,
  providerMetadata?: Record<string, Record<string, unknown>>
) {
  return new Experimental_EvaluationMockModelV4({
    supportedQuestionTypes: ["choice", "score", "boolean"],
    doEvaluate: async () => evaluationResult(answers, providerMetadata),
  });
}

beforeEach(async () => {
  resetFlagCache();
  resetJevWarning();
  mockHgetall.mockReset();
  mockHgetall.mockResolvedValue(null);
  mockDoEvaluate.mockReset();
  for (const key of ENV_KEYS) delete process.env[key];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await refreshFlags();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

describe("evaluation engines", () => {
  it("maps a choice answer onto a route decision", async () => {
    const engine = evaluationEngine("jev", () =>
      mockModel(
        {
          next_action: {
            type: "choice",
            choice: "get_roster",
            probabilities: distribution({ get_roster: 0.82, answer: 0.18 }),
          },
        },
        { typesafe: { confidence: 0.91 } }
      )
    );

    const decision = await engine.route(state("How does my team look?"));
    expect(decision.action).toBe("get_roster");
    expect(decision.probability).toBe(0.82);
    expect(decision.confidence).toBe(0.91);
    expect(decision.engine).toBe("jev");
    expect(decision.fellBack).toBe(false);
  });

  it("reports a null probability when the provider omits a distribution", async () => {
    const engine = evaluationEngine("gemini", () =>
      mockModel({ next_action: { type: "choice", choice: "answer" } })
    );
    const decision = await engine.route(state("Who should I start?"));
    expect(decision.probability).toBeNull();
    expect(decision.confidence).toBeNull();
  });

  it("rejects an action the app does not implement", async () => {
    const engine = evaluationEngine("jev", () =>
      mockModel({ next_action: { type: "choice", choice: "get_injury_report" } })
    );
    await expect(engine.route(state("Is he hurt?"))).rejects.toThrow();
  });

  it("maps verify answers onto a verify decision", async () => {
    const engine = evaluationEngine("gemini", () =>
      mockModel({
        grounded: { type: "boolean", probability: 0.4 },
        answers_question: { type: "boolean", probability: 0.95 },
        quality: { type: "score", score: 1.5 },
      })
    );
    const decision = await engine.verify({
      message: "Start Green?",
      resultSummaries: ["Green averaged 21.3 pts over his last 10"],
      draft: "Start him, he is averaging 30.",
    });
    expect(decision.grounded).toBe(0.4);
    expect(decision.answersQuestion).toBe(0.95);
    expect(decision.quality).toBe(1.5);
  });
});

describe("the rules engine", () => {
  const rules = rulesEngine();

  it("loads the roster when the user asks about their team", async () => {
    const decision = await rules.route(state("How does my team look this month?"));
    expect(decision.action).toBe("get_roster");
    expect(decision.probability).toBeNull();
  });

  it("does not reload a roster that is already in the state", async () => {
    const decision = await rules.route(
      state("How does my team look?", { rosterSummary: "Jalen Green (HOU)" })
    );
    expect(decision.action).not.toBe("get_roster");
  });

  it("picks matchup stats for a schedule question", async () => {
    const decision = await rules.route(state("Who plays four games this week?"));
    expect(decision.action).toBe("get_matchup_stats");
  });

  it("picks recent performance for a start-or-sit question", async () => {
    const decision = await rules.route(state("Should I start Jalen Green tonight?"));
    expect(decision.action).toBe("get_recent_performance");
  });

  it.each(["help", "should I?", "start or sit", "trade advice", "what do you think"])(
    "asks the user when the message is too vague: %s",
    async (message) => {
      const decision = await rules.route(state(message));
      expect(decision.action).toBe("ask_user");
    }
  );

  it("does not call a short message vague when it names a player", async () => {
    const decision = await rules.route(state("Start Wagner?"));
    expect(decision.action).toBe("get_recent_performance");
  });

  it("asks the user when the message is too vague", async () => {
    const decision = await rules.route(state("help"));
    expect(decision.action).toBe("ask_user");
  });

  it("answers once two tools have run", async () => {
    const decision = await rules.route(
      state("Should I start Jalen Green tonight?", {
        steps: [
          { action: "get_roster", resultSummary: "..." },
          { action: "get_recent_performance", resultSummary: "..." },
        ],
        stepCount: 2,
      })
    );
    expect(decision.action).toBe("answer");
  });
});

describe("getEngine and the cutoff", () => {
  it("returns the fallback engine instead of Jev after the cutoff", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    await refreshFlags();
    expect(getEngine("jev", new Date("2026-10-01T00:00:00Z")).name).toBe("rules");
  });

  it("returns Jev before the cutoff", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    await refreshFlags();
    expect(getEngine("jev", new Date("2026-09-24T12:00:00Z")).name).toBe("jev");
  });

  it("warns about a blocked Jev only once per process", () => {
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>;
    getEngine("jev", new Date("2026-10-01T00:00:00Z"));
    getEngine("jev", new Date("2026-10-01T00:00:00Z"));
    const blocked = warn.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes("Jev is blocked")
    );
    expect(blocked).toHaveLength(1);
  });
});

describe("routeWithFallback", () => {
  it("takes the primary decision when it clears the threshold", async () => {
    process.env.DECISION_ENGINE = "gemini";
    await refreshFlags();
    mockDoEvaluate.mockResolvedValue(
      evaluationResult({
        next_action: {
          type: "choice",
          choice: "get_matchup_stats",
          probabilities: distribution({ get_matchup_stats: 0.9, answer: 0.1 }),
        },
      })
    );

    const decision = await routeWithFallback(state("Who plays four games this week?"));
    expect(decision.engine).toBe("gemini");
    expect(decision.action).toBe("get_matchup_stats");
    expect(decision.fellBack).toBe(false);
  });

  it("falls back when the top probability is below the threshold", async () => {
    process.env.DECISION_ENGINE = "gemini";
    process.env.ROUTE_MIN_PROB = "0.6";
    await refreshFlags();
    mockDoEvaluate.mockResolvedValue(
      evaluationResult({
        next_action: {
          type: "choice",
          choice: "ask_user",
          probabilities: distribution({ ask_user: 0.31, get_roster: 0.29, answer: 0.4 }),
        },
      })
    );

    const decision = await routeWithFallback(state("How does my team look?"));
    expect(mockDoEvaluate).toHaveBeenCalledOnce();
    expect(decision.engine).toBe("rules");
    expect(decision.fellBack).toBe(true);
    expect(decision.action).toBe("get_roster");
  });

  it("falls back when the primary engine throws", async () => {
    process.env.DECISION_ENGINE = "gemini";
    await refreshFlags();
    mockDoEvaluate.mockRejectedValue(new Error("gateway 500"));

    const decision = await routeWithFallback(state("Who plays four games this week?"));
    expect(decision.engine).toBe("rules");
    expect(decision.fellBack).toBe(true);
    expect(decision.action).toBe("get_matchup_stats");
    expect(console.warn).toHaveBeenCalled();
  });

  it("never touches an evaluation model on the default rules engine", async () => {
    await refreshFlags();
    const decision = await routeWithFallback(state("Should I start Jalen Green tonight?"));
    expect(mockDoEvaluate).not.toHaveBeenCalled();
    expect(decision.engine).toBe("rules");
    expect(decision.fellBack).toBe(false);
  });

  it("never reaches Jev with default config after the cutoff", async () => {
    process.env.DECISION_ENGINE = "jev";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    await refreshFlags();

    const decision = await routeWithFallback(
      state("Should I start Jalen Green tonight?"),
      new Date("2026-10-01T00:00:00Z")
    );
    expect(decision.engine).toBe("rules");
    expect(mockDoEvaluate).not.toHaveBeenCalled();
  });
});
