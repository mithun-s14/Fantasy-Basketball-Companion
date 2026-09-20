import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRoute, mockStreamFn, mockGetUser, mockFrom, mockLogDecision } = vi.hoisted(() => ({
  mockRoute: vi.fn(),
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

vi.mock("@/lib/agent/engines", () => ({ routeWithFallback: mockRoute }));
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
}));

import { POST } from "@/app/api/chat/route";
import { resetFlagCache } from "@/lib/agent/config";

function chunks(...texts: string[]) {
  return (async function* () {
    for (const text of texts) yield { content: text };
  })();
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
  mockLogDecision.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockFrom.mockReturnValue({ select: () => ({ eq: async () => ({ data: [] }) }) });
  mockStreamFn.mockReset().mockResolvedValue(chunks("Start ", "Green."));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.AGENT_MODE;
  delete process.env.GEMINI_API_KEY;
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

  it("delivers an error as text once the stream has started", async () => {
    mockRoute.mockRejectedValue(new Error("engine exploded"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request("How does my team look?"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("couldn't get a response");
  });
});
