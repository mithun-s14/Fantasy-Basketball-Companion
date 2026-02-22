import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { RosterClient } from "@/components/RosterClient";
import type { RosterPlayer } from "@/lib/types";

export default async function RosterPage() {
  const supabase = await createSupabaseServerClient();

  // Defense-in-depth: verify auth even though middleware already blocks
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth?next=/roster");
  }

  const { data: players } = await supabase
    .from("roster_players")
    .select("id, player_name, nba_team, created_at")
    .order("created_at", { ascending: false });

  return (
    <RosterClient
      initialPlayers={(players as RosterPlayer[]) ?? []}
      userEmail={user.email ?? ""}
    />
  );
}
