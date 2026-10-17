import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getDraftPool, upcomingDraftSeason } from "@/lib/draft-pool";
import { rowToSettings, type Category, type LeagueProfileRow } from "@/lib/league";
import type { DraftPick } from "@/lib/draft";
import { DraftBoardClient } from "./DraftBoardClient";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-rendered from the saved picks, so a refresh resumes the draft (DB-7).
export default async function DraftBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=/draft/${id}`);

  // RLS: someone else's draft comes back empty and 404s.
  const [{ data: draft }, { data: picks }, pool] = await Promise.all([
    supabase
      .from("drafts")
      .select("id, draft_slot, punts, status, league_profiles(name, team_count, format, categories, roster_slots, draft_slot)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("draft_picks").select("overall_pick, team_slot, player_name").eq("draft_id", id).order("overall_pick"),
    getDraftPool(upcomingDraftSeason()),
  ]);
  if (!draft) notFound();

  const settings = rowToSettings(draft.league_profiles as unknown as LeagueProfileRow);
  return (
    <DraftBoardClient
      draftId={draft.id}
      pool={pool}
      settings={{ ...settings, draftSlot: draft.draft_slot }}
      initialPunts={draft.punts as Category[]}
      initialPicks={(picks ?? []) as DraftPick[]}
    />
  );
}
