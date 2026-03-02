import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: mockQuery,
        }),
      }),
    }),
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
  NextRequest: class {},
}));

import { GET } from "@/app/api/games/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(url: string): any {
  return { nextUrl: { searchParams: new URL(url).searchParams } };
}

describe("GET /api/games", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when start is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/games?end=2024-01-07"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/start/);
  });

  it("returns 400 when end is missing", async () => {
    const res = await GET(makeRequest("http://localhost/api/games?start=2024-01-01"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/end/);
  });

  it("returns 400 when date format is invalid", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/games?start=01-01-2024&end=01-07-2024")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/YYYY-MM-DD/);
  });

  it("returns 400 when start > end", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/games?start=2024-01-07&end=2024-01-01")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/before/);
  });

  it("returns 200 with correct aggregated game counts", async () => {
    mockQuery
      .mockResolvedValueOnce({
        data: [{ home_team: "Boston Celtics" }, { home_team: "Boston Celtics" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ away_team: "Los Angeles Lakers" }],
        error: null,
      });

    const res = await GET(
      makeRequest("http://localhost/api/games?start=2024-01-01&end=2024-01-07")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gameCounts["Boston Celtics"]).toBe(2);
    expect(body.gameCounts["Los Angeles Lakers"]).toBe(1);
  });

  it("initialises all 30 teams to 0", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const res = await GET(
      makeRequest("http://localhost/api/games?start=2024-01-01&end=2024-01-07")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.gameCounts)).toHaveLength(30);
    for (const count of Object.values(body.gameCounts as Record<string, number>)) {
      expect(count).toBe(0);
    }
  });

  it("returns 500 on database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockQuery.mockResolvedValueOnce({ data: null, error: new Error("DB connection failed") });

    const res = await GET(
      makeRequest("http://localhost/api/games?start=2024-01-01&end=2024-01-07")
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
