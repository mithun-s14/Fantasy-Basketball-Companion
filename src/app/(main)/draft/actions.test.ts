import { describe, it, expect, vi, beforeEach } from "vitest";

type Op = "select" | "insert" | "update" | "delete";
interface Call {
  table: string;
  op: Op;
  row?: unknown;
  filters: Record<string, unknown>;
}
const { state } = vi.hoisted(() => ({
  state: {
    handlers: {} as Record<string, Partial<Record<Op, (c: Call) => { data?: unknown; error?: unknown }>>>,
    calls: [] as Call[],
  },
}));

// Fake query builder: records each chain, answers from state.handlers.
function from(table: string) {
  const call: Call = { table, op: "select", filters: {} };
  state.calls.push(call);
  const run = async () => state.handlers[table]?.[call.op]?.(call) ?? { data: null, error: null };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, v: unknown) => ((call.filters[col] = v), b),
    in: (col: string, v: unknown) => ((call.filters[col] = v), b),
    insert: (row: unknown) => ((call.op = "insert"), (call.row = row), b),
    update: (row: unknown) => ((call.op = "update"), (call.row = row), b),
    delete: () => ((call.op = "delete"), b),
    maybeSingle: run,
    then: (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  };
  return b;
}

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from,
  }),
}));
vi.mock("@/lib/supabase", () => ({ createServerSupabaseClient: () => ({ from }) }));

import { saveDraftRoster } from "@/app/(main)/draft/actions";

function setup(existing: string[], insertError: unknown = null) {
  state.calls = [];
  state.handlers = {
    drafts: { select: () => ({ data: { id: "d1", draft_slot: 3 } }), update: () => ({ error: null }) },
    draft_picks: { select: () => ({ data: [{ player_name: "B" }, { player_name: "C" }], error: null }) },
    roster_players: {
      select: () => ({ data: existing.map((n) => ({ id: `id-${n}`, player_name: n })), error: null }),
      insert: () => ({ error: insertError }),
      delete: () => ({ error: null }),
    },
    nba_players: { select: () => ({ data: [{ name: "B", team: "Boston Celtics" }, { name: "C", team: "Utah Jazz" }], error: null }) },
  };
}
const callsTo = (table: string, op: Op) => state.calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => setup([]));

describe("saveDraftRoster", () => {
  it("saves only the user's slot's picks to an empty roster", async () => {
    expect(await saveDraftRoster("d1", false)).toEqual({ success: true, saved: 2 });
    expect(callsTo("draft_picks", "select")[0].filters).toEqual({ draft_id: "d1", team_slot: 3 });
    expect(callsTo("roster_players", "insert")[0].row).toEqual([
      { user_id: "u1", player_name: "B", nba_team: "Boston Celtics" },
      { user_id: "u1", player_name: "C", nba_team: "Utah Jazz" },
    ]);
    expect(callsTo("drafts", "update")[0].row).toHaveProperty("roster_saved_at");
  });

  it("asks before touching an existing roster", async () => {
    setup(["A", "B"]);
    expect(await saveDraftRoster("d1", false)).toEqual({ confirm: 2 });
    expect(callsTo("roster_players", "insert")).toHaveLength(0);
    expect(callsTo("roster_players", "delete")).toHaveLength(0);
  });

  it("on overwrite, inserts only new players and deletes only dropped ones", async () => {
    setup(["A", "B"]);
    expect(await saveDraftRoster("d1", true)).toEqual({ success: true, saved: 2 });
    expect(callsTo("roster_players", "insert")[0].row).toEqual([{ user_id: "u1", player_name: "C", nba_team: "Utah Jazz" }]);
    expect(callsTo("roster_players", "delete")[0].filters).toEqual({ id: ["id-A"] });
  });

  it("leaves the old roster alone when the insert fails", async () => {
    setup(["A"], { message: "boom" });
    const result = await saveDraftRoster("d1", true);
    expect(result).toEqual({ error: "Could not save your roster. Your old roster is unchanged." });
    expect(callsTo("roster_players", "delete")).toHaveLength(0);
  });
});
