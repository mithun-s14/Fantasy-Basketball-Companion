import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { currentSeason, bbrefSeasonYear, playerNameKey } from "../lib/constants";

config({ path: ".env.local" });

// Loads ESPN's average draft position into player_adp.
// Usage: npm run load-adp [-- 2026-27]. Defaults to the current season.
// Source is ESPN's public (undocumented) fantasy API; it gives no ADP deviation,
// so adp_std stays null. Run seed-players first: names are matched to nba_players.

const SOURCE = "espn";
const LIMIT = 400;

interface EspnPlayer {
  player: { fullName: string; ownership?: { averageDraftPosition?: number } };
}

async function main() {
  const season = process.argv[2] ?? currentSeason();
  if (!/^\d{4}-\d{2}$/.test(season)) throw new Error(`Season must look like 2025-26, got "${season}"`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: nbaPlayers, error: playersError } = await supabase.from("nba_players").select("name");
  if (playersError) throw new Error(`nba_players read failed: ${playersError.message}`);
  const byKey = new Map((nbaPlayers ?? []).map((p) => [playerNameKey(p.name), p.name as string]));

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${bbrefSeasonYear(season)}` +
    `/segments/0/leaguedefaults/1?view=kona_player_info`;
  const res = await fetch(url, {
    headers: {
      "X-Fantasy-Filter": JSON.stringify({
        players: { limit: LIMIT, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" } },
      }),
    },
  });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  const { players } = (await res.json()) as { players: EspnPlayer[] };

  const rows: { player_name: string; season: string; source: string; adp: number; adp_std: null }[] = [];
  const unmatched: string[] = [];
  for (const { player } of players) {
    const adp = player.ownership?.averageDraftPosition;
    if (!adp || adp <= 0) continue;
    const name = byKey.get(playerNameKey(player.fullName));
    if (!name) {
      unmatched.push(player.fullName);
      continue;
    }
    rows.push({ player_name: name, season, source: SOURCE, adp, adp_std: null });
  }

  console.log(`[load-adp] ${season}: ${rows.length} players with ADP from ESPN.`);
  if (unmatched.length > 0) {
    console.warn(`[load-adp] ${unmatched.length} ESPN names not in nba_players, skipped: ${unmatched.join(", ")}`);
  }
  if (rows.length === 0) throw new Error("No ADP rows to load.");

  // Replace this season's ESPN rows so players who fell out of the top LIMIT don't linger.
  const { error: deleteError } = await supabase
    .from("player_adp")
    .delete()
    .eq("season", season)
    .eq("source", SOURCE);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const { error: insertError } = await supabase.from("player_adp").insert(rows);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  console.log(`[load-adp] Done.`);
}

main().catch((err) => {
  console.error("[load-adp]", err);
  process.exit(1);
});
