import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getDraftPool, upcomingDraftSeason } from "@/lib/draft-pool";
import { DEFAULT_SETTINGS, rowToSettings, type LeagueProfileRow } from "@/lib/league";
import { DraftRankingsClient } from "./DraftRankingsClient";

// Public: anyone gets rankings for the default league; signed-in users get
// their saved league settings.
export default async function DraftPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [pool, profile, activeDraft] = await Promise.all([
    getDraftPool(upcomingDraftSeason()),
    user
      ? supabase
          .from("league_profiles")
          .select("name, team_count, format, categories, roster_slots, draft_slot")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("drafts").select("id").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <DraftRankingsClient
      pool={pool}
      initialSettings={profile.data ? rowToSettings(profile.data as LeagueProfileRow) : DEFAULT_SETTINGS}
      signedIn={!!user}
      activeDraftId={activeDraft.data?.id ?? null}
    />
  );
}
