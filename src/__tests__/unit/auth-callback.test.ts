import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => ({ redirectUrl: url.toString() }),
  },
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /roster on successful code exchange", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const req = new Request("http://localhost:3000/auth/callback?code=abc123");

    const res = await GET(req) as { redirectUrl: string };
    expect(res.redirectUrl).toBe("http://localhost:3000/roster");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
  });

  it("redirects to the next param on success", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const req = new Request("http://localhost:3000/auth/callback?code=xyz&next=/matchup");

    const res = await GET(req) as { redirectUrl: string };
    expect(res.redirectUrl).toBe("http://localhost:3000/matchup");
  });

  it("redirects to /auth?error=oauth_failed when no code is present", async () => {
    const req = new Request("http://localhost:3000/auth/callback");

    const res = await GET(req) as { redirectUrl: string };
    expect(res.redirectUrl).toBe("http://localhost:3000/auth?error=oauth_failed");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to /auth?error=oauth_failed when code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    const req = new Request("http://localhost:3000/auth/callback?code=bad");

    const res = await GET(req) as { redirectUrl: string };
    expect(res.redirectUrl).toBe("http://localhost:3000/auth?error=oauth_failed");
  });
});
