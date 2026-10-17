import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { teamOnClock } from "@/lib/draft";
import { ROSTER_POSITIONS, type RosterPosition } from "@/lib/league";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

type Loaded =
  | { response: NextResponse }
  | {
      response?: undefined;
      supabase: SupabaseClient;
      draft: { id: string; status: string };
      teamCount: number;
      totalPicks: number;
    };

/**
 * The draft with its league size, read through the user's session so RLS
 * returns nothing for someone else's draft.
 */
async function loadDraft(id: string): Promise<Loaded> {
  if (!UUID.test(id)) return { response: NextResponse.json({ error: "Draft not found." }, { status: 404 }) };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };

  const { data: draft, error } = await supabase
    .from("drafts")
    .select("id, status, league_profiles(team_count, roster_slots)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { response: NextResponse.json({ error: "Could not load the draft." }, { status: 500 }) };
  if (!draft) return { response: NextResponse.json({ error: "Draft not found." }, { status: 404 }) };

  const profile = draft.league_profiles as unknown as {
    team_count: number;
    roster_slots: Record<RosterPosition, number>;
  };
  const totalPicks = profile.team_count * ROSTER_POSITIONS.reduce((s, p) => s + (profile.roster_slots[p] ?? 0), 0);
  return { supabase, draft, teamCount: profile.team_count, totalPicks };
}

async function lastPick(supabase: SupabaseClient, draftId: string) {
  return supabase
    .from("draft_picks")
    .select("overall_pick")
    .eq("draft_id", draftId)
    .order("overall_pick", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** Record the next pick (DB-2). Body: { player_name, overall_pick }. The team is derived from the pick number. */
export async function POST(request: NextRequest, { params }: Params) {
  const loaded = await loadDraft((await params).id);
  if (loaded.response) return loaded.response;
  const { supabase, draft, teamCount, totalPicks } = loaded;

  const body = await request.json().catch(() => ({}));
  const playerName = body?.player_name;
  const overallPick = body?.overall_pick;
  if (typeof playerName !== "string" || playerName.length === 0 || playerName.length > 100) {
    return NextResponse.json({ error: "player_name is required." }, { status: 400 });
  }
  if (!Number.isInteger(overallPick) || overallPick < 1) {
    return NextResponse.json({ error: "overall_pick must be a positive whole number." }, { status: 400 });
  }
  if (draft.status !== "active") return NextResponse.json({ error: "This draft is complete." }, { status: 409 });
  if (overallPick > totalPicks) return NextResponse.json({ error: "The draft has no more picks." }, { status: 409 });

  const { data: last, error: lastError } = await lastPick(supabase, draft.id);
  if (lastError) return NextResponse.json({ error: "Could not load picks." }, { status: 500 });
  const expected = (last?.overall_pick ?? 0) + 1;
  if (overallPick !== expected) {
    return NextResponse.json({ error: `Pick ${overallPick} is out of order; next is ${expected}.` }, { status: 409 });
  }

  // nba_players is shared reference data, read with the service client like the rest of the app.
  const { data: known } = await createServerSupabaseClient()
    .from("nba_players")
    .select("name")
    .eq("name", playerName)
    .maybeSingle();
  if (!known) return NextResponse.json({ error: `${playerName} is not an active player.` }, { status: 400 });

  const pick = { draft_id: draft.id, overall_pick: overallPick, team_slot: teamOnClock(overallPick, teamCount), player_name: playerName };
  const { error } = await supabase.from("draft_picks").insert(pick);
  if (error) {
    // Unique on (draft_id, overall_pick) and (draft_id, player_name).
    if (error.code === "23505") {
      return NextResponse.json({ error: `${playerName} is already drafted, or pick ${overallPick} is taken.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not record the pick." }, { status: 500 });
  }

  await supabase
    .from("drafts")
    .update({ status: overallPick === totalPicks ? "complete" : "active", updated_at: new Date().toISOString() })
    .eq("id", draft.id);
  return NextResponse.json({ pick }, { status: 201 });
}

/** Undo: delete only the latest pick, and reopen the draft if it had finished. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const loaded = await loadDraft((await params).id);
  if (loaded.response) return loaded.response;
  const { supabase, draft } = loaded;

  const { data: last, error: lastError } = await lastPick(supabase, draft.id);
  if (lastError) return NextResponse.json({ error: "Could not load picks." }, { status: 500 });
  if (!last) return NextResponse.json({ error: "No picks to undo." }, { status: 409 });

  const { error } = await supabase
    .from("draft_picks")
    .delete()
    .eq("draft_id", draft.id)
    .eq("overall_pick", last.overall_pick);
  if (error) return NextResponse.json({ error: "Could not undo the pick." }, { status: 500 });

  await supabase.from("drafts").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", draft.id);
  return NextResponse.json({ removed: last.overall_pick });
}
