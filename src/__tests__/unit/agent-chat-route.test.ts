import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRoute, mockVerify, mockStreamFn, mockGetUser, mockFrom, mockLogDecision } = vi.hoisted(() => ({
  mockRoute: vi.fn(),
  mockVerify: vi.fn(),
  mockStreamFn: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockLogDecision: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ hgetall: async () => null, get: async () => null, set: async () => "OK" }) },
}));

vi.mock("@/lib/rate-limiter", () => ({
  chatRateLimiter: { limit: vi.fn().mockResolvedValue({ success: true, reset: 0 }) },
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class {
    stream = mockStreamFn;
  },
}));

vi.mock("@/lib/agent/engines", () => ({
  routeWithFallback: mockRoute,
  verifyWithFallback: mockVerify,
}));
vi.mock("@/lib/agent/log", () => ({ logDecision: mockLogDecision, newRequestId: () => "req-1" }));
vi.mock("@/lib/nba-players", () => ({
  getActivePlayers: async () => [{ name: "Jalen Green", team: "Houston Rockets" }],
}));
vi.mock("@/lib/agent/tools", () => ({
  getRosterCached: async () => ({
    summary: "The user's roster (1 players): Jalen Green (Houston Rockets).",
    players: [{ name: "Jalen Green", team: "Houston Rockets" }],
  }),
  getRecentPerformanceCached: async () => "Jalen Green (Houston Rockets): last 10 21.3p",
  getMatchupStatsCached: async () => "Houston Rockets: 4 games",
}));

import { POST } from "@/app/api/chat/route";
import { resetFlagCache } from "@/lib/agent/config";

function chunks(...texts: string[]) {
  return (async function* () {
    for (const text of texts) yield { content: text };
  })();
}

function answerDecision() {
  return {
    action: "answer",
    probability: null,
    confidence: null,
    engine: "rules" as const,
    fellBack: false,
    latencyMs: 1,
  };
}

/** Sends a message and returns the parsed SSE frames. */
async function post(message: string) {
  const response = await POST(request(message));
  return (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")));
}

function request(message: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
  }) as never;
}

beforeEach(() => {
  resetFlagCache();
  delete process.env.AGENT_MODE;
  process.env.GEMINI_API_KEY = "test-key";
  mockRoute.mockReset();
  mockVerify.mockReset().mockRejectedValue(new Error("verification is off"));
  mockLogDecision.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockFrom.mockReturnValue({ select: () => ({ eq: async () => ({ data: [] }) }) });
  mockStreamFn.mockReset().mockResolvedValue(chunks("Start ", "Green."));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.AGENT_MODE;
  delete process.env.GEMINI_API_KEY;
  delete process.env.DECISION_ENGINE_VERIFY;
  delete process.env.VERIFY_MIN_PROB;
  vi.restoreAllMocks();
});

describe("AGENT_MODE=off", () => {
  it("streams plain text and never asks an engine for a decision", async () => {
    const response = await POST(request("Should I start Jalen Green?"));

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("Start Green.");
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockLogDecision).not.toHaveBeenCalled();
  });
});

describe("AGENT_MODE=on", () => {
  beforeEach(() => {
    process.env.AGENT_MODE = "on";
  });

  it("streams SSE frames with agent_step before the answer text", async () => {
    mockRoute
      .mockResolvedValueOnce({
        action: "get_roster",
        probability: null,
        confidence: null,
        engine: "rules",
        fellBack: false,
        latencyMs: 1,
      })
      .mockResolvedValueOnce({
        action: "answer",
        probability: null,
        confidence: null,
        engine: "rules",
        fellBack: false,
        latencyMs: 1,
      });

    const response = await POST(request("How does my team look?"));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");

    const events = (await response.text())
      .split("\n\n")
      .filter(Boolean)
      .map((frame) => JSON.parse(frame.replace(/^data: /, "")));

    expect(events[0]).toEqual({ type: "agent_step", action: "get_roster" });
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe(
      "Start Green."
    );
  });

  it("feeds the tool results to the model that writes the answer", async () => {
    mockRoute
      .mockResolvedValueOnce({
        action: "get_roster",
        probability: null,
        confidence: null,
        engine: "rules",
        fellBack: false,
        latencyMs: 1,
      })
      .mockResolvedValueOnce({
        action: "answer",
        probability: null,
        confidence: null,
        engine: "rules",
        fellBack: false,
        latencyMs: 1,
      });

    await (await POST(request("How does my team look?"))).text();

    const systemPrompt = mockStreamFn.mock.calls[0][0][0].content as string;
    expect(systemPrompt).toContain("TOOL RESULTS");
    expect(systemPrompt).toContain("Jalen Green (Houston Rockets)");
  });

  it("tells the model to ask a clarifying question when the request is vague", async () => {
    mockRoute.mockResolvedValue({
      action: "ask_user",
      probability: null,
      confidence: null,
      engine: "rules",
      fellBack: false,
      latencyMs: 1,
    });

    await (await POST(request("help"))).text();

    const systemPrompt = mockStreamFn.mock.calls[0][0][0].content as string;
    expect(systemPrompt).toContain("clarifying question");
  });

  it("warns when the answer is not grounded in the tool results", async () => {
    process.env.DECISION_ENGINE_VERIFY = "gemini";
    process.env.VERIFY_MIN_PROB = "0.7";
    mockRoute.mockResolvedValue(answerDecision());
    mockVerify.mockResolvedValue({
      grounded: 0.2,
      answersQuestion: 0.9,
      quality: 0.8,
      engine: "gemini",
      fellBack: false,
      latencyMs: 5,
    });

    const events = await post("Should I start Jalen Green?");

    // The warning lands after the answer, never before it
    const warning = events[events.length - 1];
    expect(warning.type).toBe("agent_warning");
    expect(warning.message).toContain("may not match");
    expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe(
      "Start Green."
    );
    expect(
      mockLogDecision.mock.calls.some(([arg]) => arg.decision.engine === "gemini")
    ).toBe(true);
  });

  it("stays quiet when the answer is grounded", async () => {
    process.env.DECISION_ENGINE_VERIFY = "gemini";
    mockRoute.mockResolvedValue(answerDecision());
    mockVerify.mockResolvedValue({
      grounded: 0.95,
      answersQuestion: 0.9,
      quality: 0.9,
      engine: "gemini",
      fellBack: false,
      latencyMs: 5,
    });

    const events = await post("Should I start Jalen Green?");
    expect(events.some((e) => e.type === "agent_warning")).toBe(false);
  });

  it("never verifies when verification is off", async () => {
    process.env.DECISION_ENGINE_VERIFY = "off";
    mockRoute.mockResolvedValue(answerDecision());

    const events = await post("Should I start Jalen Green?");
    expect(mockVerify).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "agent_warning")).toBe(false);
  });

  it("delivers an error as text once the stream has started", async () => {
    mockRoute.mockRejectedValue(new Error("engine exploded"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request("How does my team look?"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("couldn't get a response");
  });
});
