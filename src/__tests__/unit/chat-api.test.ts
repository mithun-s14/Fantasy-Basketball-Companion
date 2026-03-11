import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const { mockGetUser, mockFrom, mockChatRateLimiter } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockFrom = vi.fn();
  const mockChatRateLimiter = {
    check: vi.fn(),
    reset: vi.fn(),
  };
  return { mockGetUser, mockFrom, mockChatRateLimiter };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/rate-limiter", () => ({
  chatRateLimiter: mockChatRateLimiter,
}));

// Mock the Gemini SDK so we never hit the network
vi.mock("@google/generative-ai", () => {
  class GoogleGenerativeAI {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_apiKey: string) {}
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessageStream: async () => ({
            stream: (async function* () {
              yield { text: () => "Hello from AI" };
            })(),
          }),
        }),
      };
    }
  }
  return { GoogleGenerativeAI };
});

import { POST } from "@/app/api/chat/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

const VALID_MESSAGES = { messages: [{ role: "user", content: "Who should I start?" }] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/chat — rate limiting", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    mockChatRateLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await POST(makeRequest(VALID_MESSAGES) as never);
    expect(res.status).toBe(429);
    expect(await res.text()).toMatch(/too many requests/i);
  });

  it("includes Retry-After and rate-limit headers on 429", async () => {
    const resetAt = Date.now() + 45_000;
    mockChatRateLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt,
    });

    const res = await POST(makeRequest(VALID_MESSAGES) as never);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(resetAt));
  });

  it("reads IP from x-forwarded-for header", async () => {
    mockChatRateLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    await POST(
      makeRequest(VALID_MESSAGES, { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) as never
    );

    // Only the first (client) IP should be used as the rate-limit key
    expect(mockChatRateLimiter.check).toHaveBeenCalledWith("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    mockChatRateLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    await POST(
      makeRequest(VALID_MESSAGES, { "x-real-ip": "9.8.7.6" }) as never
    );

    expect(mockChatRateLimiter.check).toHaveBeenCalledWith("9.8.7.6");
  });

  it("uses 'unknown' key when no IP headers are present", async () => {
    mockChatRateLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    await POST(makeRequest(VALID_MESSAGES) as never);

    expect(mockChatRateLimiter.check).toHaveBeenCalledWith("unknown");
  });
});

describe("POST /api/chat — allowed requests", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mockChatRateLimiter.check.mockReturnValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages array is empty", async () => {
    const res = await POST(makeRequest({ messages: [] }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages field is missing", async () => {
    const res = await POST(makeRequest({ notMessages: "oops" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 503 when GEMINI_API_KEY is not set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await POST(makeRequest(VALID_MESSAGES) as never);
    expect(res.status).toBe(503);
  });

  it("streams a 200 response for a valid request", async () => {
    const res = await POST(makeRequest(VALID_MESSAGES) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("Hello from AI");
  });
});
