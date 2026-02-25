"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NBA_TEAMS } from "@/lib/constants";
import { getActivePlayers } from "@/lib/nba-players";

const PLAYER_NAME_REGEX = /^[\p{L}]+([ \-'][\p{L}]+)*$/u;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addPlayer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in to add players." };

    const playerName = (formData.get("player_name") as string | null)?.trim() ?? "";
    const nbaTeam = (formData.get("nba_team") as string | null)?.trim() ?? "";

    if (!PLAYER_NAME_REGEX.test(playerName)) {
      return {
        error:
          "Player name must be 2–60 characters and contain only letters, spaces, hyphens, apostrophes, or periods.",
      };
    }

    // Validate against active NBA player roster and resolve canonical team name
    let resolvedTeam = nbaTeam;
    try {
      const activePlayers = await getActivePlayers();
      const normalizedInput = playerName.normalize("NFC").toLowerCase();
      const match = activePlayers.find(
        (p) => p.name.toLowerCase() === normalizedInput
      );
      if (!match) {
        return {
          error:
            "Player not found on an active NBA roster. Please select a player from the suggestions.",
        };
      }
      resolvedTeam = match.team; // canonical team name from NBA API
      if (!NBA_TEAMS.includes(resolvedTeam)) {
        return { error: "Could not determine a valid team for this player." };
      }
    } catch (nbaErr) {
      // NBA API unavailable — fall back to submitted team name
      console.error("[addPlayer] NBA API error:", nbaErr);
      if (!NBA_TEAMS.includes(nbaTeam)) {
        return { error: "Please select a valid NBA team." };
      }
    }

    const { error } = await supabase.from("roster_players").insert({
      user_id: user.id,
      player_name: playerName,
      nba_team: resolvedTeam,
    });

    if (error) {
      if (error.code === "23505") {
        return { error: `${playerName} is already on your roster.` };
      }
      console.error("[addPlayer] Supabase insert error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        playerName,
        resolvedTeam,
      });
      return { error: "Failed to add player. Please try again." };
    }

    return { success: true };
  } catch (err) {
    console.error("[addPlayer] Unhandled error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function removePlayer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to remove players." };

  const playerId = (formData.get("player_id") as string | null) ?? "";

  if (!UUID_REGEX.test(playerId)) {
    return { error: "Invalid player ID." };
  }

  const { error } = await supabase
    .from("roster_players")
    .delete()
    .eq("id", playerId)
    .eq("user_id", user.id); // defense-in-depth alongside RLS

  if (error) {
    return { error: "Failed to remove player. Please try again." };
  }

  return { success: true };
}
