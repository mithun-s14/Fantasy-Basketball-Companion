import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MatchupClient } from "@/components/MatchupClient";
import type { RosterPlayer, OpponentPlayer, PlayerStats } from "@/lib/types";

export default async function MatchupPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/matchup");

  const [{ data: userPlayers }, { data: opponentPlayers }] = await Promise.all([
    supabase
      .from("roster_players")
      .select("id, player_name, nba_team, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("opponent_players")
      .select("id, player_name, nba_team, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const allPlayerNames = [
    ...(userPlayers ?? []).map((p) => p.player_name),
    ...(opponentPlayers ?? []).map((p) => p.player_name),
  ];

  const { data: stats } =
    allPlayerNames.length > 0
      ? await supabase
          .from("player_stats")
          .select("*")
          .in("player_name", allPlayerNames)
      : { data: [] };

  return (
    <MatchupClient
      userPlayers={(userPlayers as RosterPlayer[]) ?? []}
      opponentPlayers={(opponentPlayers as OpponentPlayer[]) ?? []}
      allStats={(stats as PlayerStats[]) ?? []}
    />
  );
}
