import { describe, it, expect, vi, beforeEach } from "vitest";

// A fake Supabase query builder: every chain method records into `calls` and
// the awaited result comes from `handlers[table][op]`.
type Op = "select" | "insert" | "update" | "delete";
type Result = { data?: unknown; error?: { code?: string; message?: string } | null };
const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "user-1" } as { id: string } | null,
    handlers: {} as Record<string, Partial<Record<Op, (call: Call) => Result>>>,
    calls: [] as Call[],
  },
}));
interface Call {
  table: string;
  op: Op;
  row?: unknown;
  filters: Record<string, unknown>;
}

function from(table: string) {
  const call: Call = { table, op: "select", filters: {} };
  state.calls.push(call);
  const run = async () => state.handlers[table]?.[call.op]?.(call) ?? { data: null, error: null };
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (col: string, val: unknown) => ((call.filters[col] = val), b),
    insert: (row: unknown) => ((call.op = "insert"), (call.row = row), b),
    update: (row: unknown) => ((call.op = "update"), (call.row = row), b),
    delete: () => ((call.op = "delete"), b),
    maybeSingle: run,
    single: run,
    then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return b;
}

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from,
  }),
}));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({ from }) }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
  NextRequest: class {},
}));

import { POST, DELETE } from "@/app/api/drafts/[id]/picks/route";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: DRAFT_ID }) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown): any => ({ json: async () => body });

// 10 teams × 2 roster spots = 20 picks.
const draftRow = {
  id: DRAFT_ID,
  status: "active",
  league_profiles: { team_count: 10, roster_slots: { PG: 1, BENCH: 1 } },
};

function setup({ lastPick = 4, draft = draftRow as unknown, insertError = null as Result["error"] } = {}) {
  state.handlers = {
    drafts: { select: () => ({ data: draft }), update: () => ({ error: null }) },
    draft_picks: {
      select: () => ({ data: lastPick ? { overall_pick: lastPick } : null }),
      insert: () => ({ error: insertError }),
      delete: () => ({ error: null }),
    },
    nba_players: { select: (c) => ({ data: c.filters.name === "Retired Guy" ? null : { name: c.filters.name } }) },
  };
}

beforeEach(() => {
  state.user = { id: "user-1" };
  state.calls = [];
  setup();
});

const callsTo = (table: string, op: Op) => state.calls.filter((c) => c.table === table && c.op === op);

describe("POST /api/drafts/[id]/picks", () => {
  it("records the next pick with the team on the clock", async () => {
    const res = await POST(req({ player_name: "Nikola Jokić", overall_pick: 5 }), params);
    expect(res.status).toBe(201);
    expect(callsTo("draft_picks", "insert")[0].row).toEqual({
      draft_id: DRAFT_ID,
      overall_pick: 5,
      team_slot: 5,
      player_name: "Nikola Jokić",
    });
    expect(callsTo("drafts", "update")[0].row).toMatchObject({ status: "active" });
  });

  it("marks the draft complete on the last pick", async () => {
    setup({ lastPick: 19 });
    const res = await POST(req({ player_name: "Last Guy", overall_pick: 20 }), params);
    expect(res.status).toBe(201);
    expect(callsTo("draft_picks", "insert")[0].row).toMatchObject({ team_slot: 1 }); // round 2 snakes back
    expect(callsTo("drafts", "update")[0].row).toMatchObject({ status: "complete" });
  });

  it("rejects a player who is already drafted", async () => {
    setup({ insertError: { code: "23505" } });
    const res = await POST(req({ player_name: "Nikola Jokić", overall_pick: 5 }), params);
    expect(res.status).toBe(409);
  });

  it("rejects a pick number that isn't next", async () => {
    for (const overall_pick of [4, 6]) {
      const res = await POST(req({ player_name: "Nikola Jokić", overall_pick }), params);
      expect(res.status).toBe(409);
    }
    expect(callsTo("draft_picks", "insert")).toHaveLength(0);
  });

  it("returns 404 for another user's draft (RLS hides it)", async () => {
    setup({ draft: null });
    const res = await POST(req({ player_name: "Nikola Jokić", overall_pick: 5 }), params);
    expect(res.status).toBe(404);
    expect(callsTo("draft_picks", "insert")).toHaveLength(0);
  });

  it("returns 401 when signed out", async () => {
    state.user = null;
    const res = await POST(req({ player_name: "Nikola Jokić", overall_pick: 5 }), params);
    expect(res.status).toBe(401);
  });

  it("rejects unknown players, bad bodies and finished drafts", async () => {
    expect((await POST(req({ player_name: "Retired Guy", overall_pick: 5 }), params)).status).toBe(400);
    expect((await POST(req({ overall_pick: 5 }), params)).status).toBe(400);
    expect((await POST(req({ player_name: "X", overall_pick: 2.5 }), params)).status).toBe(400);
    setup({ draft: { ...draftRow, status: "complete" } });
    expect((await POST(req({ player_name: "X", overall_pick: 5 }), params)).status).toBe(409);
  });

  it("returns 404 for a malformed id without querying", async () => {
    const res = await POST(req({ player_name: "X", overall_pick: 1 }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(state.calls).toHaveLength(0);
  });
});

describe("DELETE /api/drafts/[id]/picks (undo)", () => {
  it("deletes only the latest pick and reopens the draft", async () => {
    const res = await DELETE(req({}), params);
    expect(res.status).toBe(200);
    const deletes = callsTo("draft_picks", "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].filters).toEqual({ draft_id: DRAFT_ID, overall_pick: 4 });
    expect(callsTo("drafts", "update")[0].row).toMatchObject({ status: "active" });
  });

  it("returns 409 with nothing to undo", async () => {
    setup({ lastPick: 0 });
    expect((await DELETE(req({}), params)).status).toBe(409);
  });
});
