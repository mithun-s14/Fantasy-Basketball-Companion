import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { currentSeason, bbrefSeasonYear, playerNameKey } from "../lib/constants";

config({ path: ".env.local" });

// Usage: npm run scrape-stats [-- 2025-26]. Defaults to the current season.
const SEASON = process.argv[2] ?? currentSeason();
if (!/^\d{4}-\d{2}$/.test(SEASON)) {
  console.error(`[scrape-stats] Season must look like 2025-26, got "${SEASON}"`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// BBRef team abbreviation → full name
// ---------------------------------------------------------------------------
const BBREF_ABR_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
  BRK: "Brooklyn Nets",
  CHO: "Charlotte Hornets",
};

interface StatRow {
  player_name: string;
  nba_team: string;
  stat_type: "season";
  season: string;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  three_pm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
}

// ---------------------------------------------------------------------------
// Basketball-Reference — season averages only. NBA.com (which had last-10)
// doesn't respond to GitHub Actions runners, so it was dropped.
// ---------------------------------------------------------------------------
async function fetchBbrefStats(): Promise<StatRow[] | null> {
  const url = `https://www.basketball-reference.com/leagues/NBA_${bbrefSeasonYear(SEASON)}_per_game.html`;
  console.log(`[scrape-stats] Fetching BBRef: ${url}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[scrape-stats] BBRef returned ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Use a Map to keep the last (most recent) row per player.
    // BBRef lists rows in this order: xTM combined row first, then per-team rows
    // in chronological trade order. By skipping xTM rows and overwriting on each
    // subsequent per-team row, the final map entry per player is their current team.
    // Assumption: BBRef per-team rows are in chronological order (consistent since 2010s).
    const playerMap = new Map<string, StatRow>();
    // Traded players: games played comes from the xTM combined row, not the last team.
    const totalGp = new Map<string, number>();

    $("#per_game_stats tbody tr").each((_, el) => {
      const tds = $(el).find("td");
      if (tds.length === 0) return;

      const playerName = $(el).find('[data-stat="name_display"]').text().trim();
      const teamAbr    = $(el).find('[data-stat="team_name_abbr"]').text().trim();

      const g = (key: string) => parseFloat($(el).find(`[data-stat="${key}"]`).text()) || 0;

      // Skip xTM combined rows (2TM, 3TM) — we want per-team rows only
      if (playerName && teamAbr.endsWith("TM")) totalGp.set(playerName.normalize("NFC"), g("games"));
      if (!playerName || teamAbr.endsWith("TM")) return;

      playerMap.set(playerName.normalize("NFC"), {
        player_name: playerName.normalize("NFC"),
        nba_team:    BBREF_ABR_TO_FULL[teamAbr] ?? teamAbr,
        stat_type:   "season",
        season:      SEASON,
        gp:       g("games"),
        pts:      g("pts_per_g"),
        reb:      g("trb_per_g"),
        ast:      g("ast_per_g"),
        stl:      g("stl_per_g"),
        blk:      g("blk_per_g"),
        tov:      g("tov_per_g"),
        three_pm: g("fg3_per_g"),
        fgm:      g("fg_per_g"),
        fga:      g("fga_per_g"),
        ftm:      g("ft_per_g"),
        fta:      g("fta_per_g"),
      });
    });

    const rows = Array.from(playerMap.values()).map((r) => ({ ...r, gp: totalGp.get(r.player_name) ?? r.gp }));
    console.log(`[scrape-stats] BBRef: parsed ${rows.length} player rows`);
    return rows.length > 0 ? rows : null;
  } catch (err) {
    console.warn("[scrape-stats] BBRef fetch error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[scrape-stats] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`[scrape-stats] Season ${SEASON}`);
  const allRows = await fetchBbrefStats();
  if (!allRows) {
    console.error("[scrape-stats] BBRef returned no rows. Aborting.");
    process.exit(1);
  }

  // Store names as nba_players spells them (NBA.com), so stats join to positions,
  // ADP and rosters.
  const { data: nbaPlayers, error: playersError } = await supabase.from("nba_players").select("name");
  if (playersError) {
    console.warn("[scrape-stats] nba_players read failed; keeping source spellings:", playersError.message);
  } else {
    const canonical = new Map((nbaPlayers ?? []).map((p) => [playerNameKey(p.name), p.name as string]));
    let renamed = 0;
    for (const row of allRows) {
      const name = canonical.get(playerNameKey(row.player_name));
      if (name && name !== row.player_name) {
        row.player_name = name;
        renamed++;
      }
    }
    console.log(`[scrape-stats] Renamed ${renamed} players to their nba_players spelling.`);
  }

  const BATCH = 200;
  let upserted = 0;
  let hadError = false;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("player_stats")
      .upsert(batch, { onConflict: "player_name,stat_type,season" });

    if (error) {
      console.error(`[scrape-stats] Upsert error at batch ${i}:`, error.message);
      hadError = true;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`[scrape-stats] Done. Upserted ${upserted} of ${allRows.length} rows.`);
  if (hadError) {
    console.error("[scrape-stats] Some batches failed — exiting with error.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[scrape-stats] Fatal error:", err);
  process.exit(1);
});
