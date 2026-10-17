"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { settingsErrors, settingsToRow, type LeagueSettings } from "@/lib/league";

/**
 * Saves the signed-in user's league settings. One profile per user for now
 * (multiple profiles is LS-5, P1): updates the latest one or creates it.
 */
export async function saveLeagueProfile(settings: LeagueSettings): Promise<{ error: string } | { success: true }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Sign in to save your league." };

    const errors = settingsErrors(settings);
    if (errors.length > 0) return { error: errors.join(" ") };
    const row = settingsToRow(settings);

    const { data: existing, error: readError } = await supabase
      .from("league_profiles")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) return { error: "Could not load your league. Try again." };

    // A draft's pick order depends on these settings, so they're locked mid-draft.
    if (existing) {
      const { data: active } = await supabase
        .from("drafts")
        .select("id")
        .eq("league_profile_id", existing.id)
        .eq("status", "active")
        .maybeSingle();
      if (active) return { error: "Finish or abandon your active draft before changing league settings." };
    }

    const { error } = existing
      ? await supabase.from("league_profiles").update(row).eq("id", existing.id)
      : await supabase.from("league_profiles").insert({ ...row, user_id: user.id });
    if (error) return { error: "Could not save your league. Try again." };
    return { success: true };
  } catch {
    return { error: "Could not save your league. Try again." };
  }
}

export type SaveRosterResult = { error: string } | { confirm: number } | { success: true; saved: number };

/**
 * Saves the user's picks from a draft as their roster (RH-1). With players
 * already on the roster and `overwrite` false, returns { confirm: count } so
 * the UI can warn first (RH-2).
 */
export async function saveDraftRoster(draftId: string, overwrite: boolean): Promise<SaveRosterResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Sign in to save your roster." };

    // RLS: someone else's draft comes back empty.
    const { data: draft } = await supabase.from("drafts").select("id, draft_slot").eq("id", draftId).maybeSingle();
    if (!draft) return { error: "Draft not found." };

    const { data: picks, error: picksError } = await supabase
      .from("draft_picks")
      .select("player_name")
      .eq("draft_id", draft.id)
      .eq("team_slot", draft.draft_slot);
    if (picksError) return { error: "Could not load your picks." };
    const names = (picks ?? []).map((p) => p.player_name as string);
    if (names.length === 0) return { error: "You haven't drafted anyone yet." };

    const { data: existing, error: rosterError } = await supabase.from("roster_players").select("id, player_name");
    if (rosterError) return { error: "Could not load your current roster." };
    if ((existing ?? []).length > 0 && !overwrite) return { confirm: existing!.length };

    const { data: teams, error: teamsError } = await createServerSupabaseClient()
      .from("nba_players")
      .select("name, team")
      .in("name", names);
    if (teamsError) return { error: "Could not look up player teams." };
    const teamOf = new Map((teams ?? []).map((t) => [t.name as string, t.team as string]));

    // Change only the difference. Players kept from the old roster stay as
    // they are (the roster is unique per player), new ones go in first, and
    // dropped ones come out last, so a failed insert leaves the old roster whole.
    const keep = new Set((existing ?? []).map((r) => r.player_name as string));
    const toInsert = names
      .filter((n) => !keep.has(n))
      .map((n) => ({ user_id: user.id, player_name: n, nba_team: teamOf.get(n) ?? "" }));
    const toDelete = (existing ?? []).filter((r) => !names.includes(r.player_name)).map((r) => r.id as string);

    if (toInsert.length > 0) {
      const { error } = await supabase.from("roster_players").insert(toInsert);
      if (error) return { error: "Could not save your roster. Your old roster is unchanged." };
    }
    if (toDelete.length > 0) {
      const { error } = await supabase.from("roster_players").delete().in("id", toDelete);
      if (error) return { error: "Saved your picks, but couldn't remove your old players. Remove them on the Roster page." };
    }

    await supabase.from("drafts").update({ roster_saved_at: new Date().toISOString() }).eq("id", draft.id);
    return { success: true, saved: names.length };
  } catch {
    return { error: "Could not save your roster. Try again." };
  }
}
