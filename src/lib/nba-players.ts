import { createServerSupabaseClient } from "./supabase";

export interface NBAPlayer {
  name: string;
  team: string;
}

export async function getActivePlayers(): Promise<NBAPlayer[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("nba_players")
    .select("name, team")
    .order("name");

  if (error) throw new Error(`Failed to fetch players: ${error.message}`);
  return data ?? [];
}

export function searchPlayers(
  players: NBAPlayer[],
  query: string,
  limit = 8
): NBAPlayer[] {
  const q = query.normalize("NFC").toLowerCase();
  return players
    .filter((p) =>
      p.name.toLowerCase().split(" ").some((part) => part.startsWith(q))
    )
    .slice(0, limit);
}
