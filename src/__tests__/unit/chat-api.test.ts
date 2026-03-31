import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const { mockLimit, mockGetUser, mockFrom, mockStreamFn } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockStreamFn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/rate-limiter", () => ({
  chatRateLimiter: { limit: mockLimit },
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

// Mock ChatGoogleGenerativeAI so we never hit the network.
// stream is assigned as an instance field pointing at the hoisted mockStreamFn
// so every instance shares the same spy and tests can reconfigure it per-case.
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(public config: any) {}
    stream = mockStreamFn;
  },
}));

// @langchain/core/messages and @langchain/core/chat_history are NOT mocked:
// they are pure in-memory data classes with no I/O, so using the real
// implementations gives more accurate assertions about message shape.

import { POST } from "@/app/api/chat/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an async iterable that yields chunks with the given content strings. */
function makeChunks(...texts: string[]) {
  return (async function* () {
    for (const text of texts) {
      yield { content: text };
    }
  })();
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const SINGLE_USER_MESSAGE = {
  messages: [{ role: "user", content: "Who should I start?" }],
};

const MULTI_TURN = {
  messages: [
    { role: "user", content: "Who is the best center?" },
    { role: "assistant", content: "Joel Embiid." },
    { role: "user", content: "What about for streaming?" },
  ],
};

// Shared beforeEach used by suites that want a passing rate-limit check
function allowRequest() {
  mockLimit.mockResolvedValue({ success: true, remaining: 2, reset: Date.now() + 60_000 });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
describe("POST /api/chat — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });

    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.status).toBe(429);
    expect(await res.text()).toMatch(/too many requests/i);
  });

  it("includes Retry-After and rate-limit headers on 429", async () => {
    const reset = Date.now() + 45_000;
    mockLimit.mockResolvedValue({ success: false, reset });

    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(reset));
  });

  it("rate-limits by the first IP in x-forwarded-for", async () => {
    mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });

    await POST(
      makeRequest(SINGLE_USER_MESSAGE, { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) as never
    );

    expect(mockLimit).toHaveBeenCalledWith("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });

    await POST(makeRequest(SINGLE_USER_MESSAGE, { "x-real-ip": "9.8.7.6" }) as never);

    expect(mockLimit).toHaveBeenCalledWith("9.8.7.6");
  });

  it("uses 'unknown' as the key when no IP headers are present", async () => {
    mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 1_000 });

    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    expect(mockLimit).toHaveBeenCalledWith("unknown");
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe("POST /api/chat — input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    allowRequest();
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("returns 400 for an invalid JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not-json",
    });
    expect((await POST(req as never)).status).toBe(400);
  });

  it("returns 400 when the messages array is empty", async () => {
    expect((await POST(makeRequest({ messages: [] }) as never)).status).toBe(400);
  });

  it("returns 400 when the messages field is missing", async () => {
    expect((await POST(makeRequest({ notMessages: "oops" }) as never)).status).toBe(400);
  });

  it("returns 503 when GEMINI_API_KEY is not configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await POST(makeRequest(SINGLE_USER_MESSAGE) as never)).status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// LangChain model invocation & streaming
// ---------------------------------------------------------------------------
describe("POST /api/chat — LangChain model invocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    allowRequest();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    // Fresh async generator for every test
    mockStreamFn.mockReturnValue(makeChunks("Hello from LangChain"));
  });

  it("returns 200 with text/plain content type", async () => {
    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("sets Cache-Control: no-cache on success", async () => {
    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("assembles multi-chunk stream into the correct full text", async () => {
    mockStreamFn.mockReturnValue(makeChunks("Part 1 ", "Part 2 ", "Part 3"));

    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(await res.text()).toBe("Part 1 Part 2 Part 3");
  });

  it("constructs ChatGoogleGenerativeAI with gemini-2.5-flash and the env API key", async () => {
    const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
    const ctor = vi.spyOn(ChatGoogleGenerativeAI.prototype, "constructor" as never) as ReturnType<typeof vi.spyOn>;

    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    // The mock class stores config on `this.config`
    expect(mockStreamFn).toHaveBeenCalled();
    // Verify config via the instance captured in mock.calls
    const instance = (mockStreamFn as ReturnType<typeof vi.fn>).mock.instances[0] as {
      config: { model: string; apiKey: string };
    };
    expect(instance.config.model).toBe("gemini-2.5-flash");
    expect(instance.config.apiKey).toBe("test-key");

    ctor.mockRestore();
  });

  it("returns 500 and logs when model.stream() throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockStreamFn.mockRejectedValue(new Error("Gemini down"));

    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Conversation history (InMemoryChatMessageHistory / buffer)
// ---------------------------------------------------------------------------
describe("POST /api/chat — conversation history", () => {
  // Capture the messages array passed to model.stream() for inspection
  type LangChainMsg = { _getType(): string; content: string };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    allowRequest();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockStreamFn.mockReturnValue(makeChunks("ok"));
  });

  it("single user message → [SystemMessage, HumanMessage] passed to model", async () => {
    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    expect(msgs).toHaveLength(2);
    expect(msgs[0]._getType()).toBe("system");
    expect(msgs[1]._getType()).toBe("human");
    expect(msgs[1].content).toBe("Who should I start?");
  });

  it("multi-turn: prior messages appear as typed HumanMessage/AIMessage in the buffer", async () => {
    await POST(makeRequest(MULTI_TURN) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    // [System, Human, AI, Human]
    expect(msgs).toHaveLength(4);
    expect(msgs[0]._getType()).toBe("system");
    expect(msgs[1]._getType()).toBe("human");
    expect(msgs[1].content).toBe("Who is the best center?");
    expect(msgs[2]._getType()).toBe("ai");
    expect(msgs[2].content).toBe("Joel Embiid.");
    expect(msgs[3]._getType()).toBe("human");
    expect(msgs[3].content).toBe("What about for streaming?");
  });

  it("history is trimmed to the 20 most recent messages before building the buffer", async () => {
    // 25 alternating messages — only the last 20 should reach the model
    const manyMessages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));

    await POST(makeRequest({ messages: manyMessages }) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    // SystemMessage + 20 history messages = 21 total
    expect(msgs).toHaveLength(21);
  });

  it("the system prompt is always the first message regardless of history length", async () => {
    await POST(makeRequest(MULTI_TURN) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    expect(msgs[0]._getType()).toBe("system");
  });

  it("the current user turn is always the last message in the array", async () => {
    await POST(makeRequest(MULTI_TURN) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    const last = msgs[msgs.length - 1];
    expect(last._getType()).toBe("human");
    expect(last.content).toBe("What about for streaming?");
  });
});

// ---------------------------------------------------------------------------
// Roster context injection
// ---------------------------------------------------------------------------
describe("POST /api/chat — roster context", () => {
  type LangChainMsg = { _getType(): string; content: string };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    allowRequest();
    mockStreamFn.mockReturnValue(makeChunks("Advice here"));
  });

  it("injects player names and teams into the system prompt for authenticated users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { player_name: "LeBron James", nba_team: "Los Angeles Lakers" },
          { player_name: "Stephen Curry", nba_team: "Golden State Warriors" },
        ],
        error: null,
      }),
    });

    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    const systemContent = msgs[0].content;
    expect(systemContent).toContain("LeBron James (Los Angeles Lakers)");
    expect(systemContent).toContain("Stephen Curry (Golden State Warriors)");
  });

  it("omits roster text from the system prompt for unauthenticated users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    expect(msgs[0].content).not.toContain("fantasy roster:");
  });

  it("omits roster text when the user has no saved players", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-456" } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    await POST(makeRequest(SINGLE_USER_MESSAGE) as never);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    expect(msgs[0].content).not.toContain("fantasy roster:");
  });

  it("proceeds without roster context when the auth service throws", async () => {
    mockGetUser.mockRejectedValue(new Error("Auth service down"));

    // Should succeed — the catch block swallows auth errors
    const res = await POST(makeRequest(SINGLE_USER_MESSAGE) as never);
    expect(res.status).toBe(200);

    const [msgs] = mockStreamFn.mock.calls[0] as [LangChainMsg[]];
    expect(msgs[0].content).not.toContain("fantasy roster:");
  });
});
