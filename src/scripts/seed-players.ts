import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { currentSeason, bbrefSeasonYear, playerNameKey } from "../lib/constants";

// Load .env.local for standalone script execution
config({ path: ".env.local" });

const TEAM_ABBR_TO_NAME: Record<string, string> = {
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
  LAC: "Los Angeles Clippers",
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
};

/**
 * Positions by player from Basketball-Reference's per-game pages for `season`
 * and the one before it (so players are covered before the new season has
 * rows). A player listed at different positions, e.g. after a trade, gets
 * all of them. BBRef lists one of PG/SG/SF/PF/C per row. Keyed by playerNameKey,
 * since BBRef spells some names differently from NBA.com.
 */
async function fetchPositions(season: string): Promise<Map<string, Set<string>>> {
  const positions = new Map<string, Set<string>>();
  const endYear = bbrefSeasonYear(season);
  for (const year of [endYear - 1, endYear]) {
    const res = await fetch(`https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`);
    if (!res.ok) {
      console.warn(`BBRef ${year} returned ${res.status}; skipping.`);
      continue;
    }
    const $ = cheerio.load(await res.text());
    $("#per_game_stats tbody tr").each((_, el) => {
      const name = playerNameKey($(el).find('[data-stat="name_display"]').text());
      const pos = $(el).find('[data-stat="pos"]').text().trim();
      if (!name || !pos) return;
      if (!positions.has(name)) positions.set(name, new Set());
      for (const p of pos.split("-")) positions.get(name)!.add(p);
    });
  }
  return positions;
}

async function seedPlayers() {
  // Usage: npm run seed-players [-- 2025-26]. Defaults to the current season.
  const season = process.argv[2] ?? currentSeason();
  if (!/^\d{4}-\d{2}$/.test(season)) throw new Error(`Season must look like 2025-26, got "${season}"`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("Fetching active players from NBA Stats API...");

  const res = await fetch(
    `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${season}&IsOnlyCurrentSeason=1`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.nba.com/",
        Origin: "https://www.nba.com",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`NBA Stats API returned ${res.status}`);
  }

  const json = await res.json();
  const resultSet = json.resultSets[0];
  const headers: string[] = resultSet.headers;
  const rows: (string | number)[][] = resultSet.rowSet;

  const nameIdx = headers.indexOf("DISPLAY_FIRST_LAST");
  const abbrevIdx = headers.indexOf("TEAM_ABBREVIATION");
  const rosterStatusIdx = headers.indexOf("ROSTERSTATUS");

  const players = rows
    .filter(
      (row) =>
        Number(row[rosterStatusIdx]) === 1 &&
        typeof row[abbrevIdx] === "string" &&
        (row[abbrevIdx] as string).length > 0
    )
    .map((row) => ({
      name: (row[nameIdx] as string).normalize("NFC"),
      team:
        TEAM_ABBR_TO_NAME[row[abbrevIdx] as string] ??
        (row[abbrevIdx] as string),
    }));

  console.log(`Found ${players.length} active players.`);

  console.log("Fetching positions from Basketball-Reference...");
  const positions = await fetchPositions(season);
  const withPositions = players.map((p) => ({ ...p, positions: [...(positions.get(playerNameKey(p.name)) ?? [])] }));
  const missing = withPositions.filter((r) => r.positions.length === 0).map((r) => r.name);
  if (missing.length > 0) {
    console.warn(`No position for ${missing.length} players (rookies or name mismatches): ${missing.join(", ")}`);
  }

  // Clear existing rows then insert fresh
  const { error: deleteError } = await supabase
    .from("nba_players")
    .delete()
    .not("id", "is", null);

  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const { error: insertError } = await supabase
    .from("nba_players")
    .insert(withPositions);

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  console.log(`Done — ${players.length} players seeded into nba_players.`);
}

seedPlayers().catch((err) => {
  console.error(err);
  process.exit(1);
});
