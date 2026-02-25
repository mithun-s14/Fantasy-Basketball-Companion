import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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

async function seedPlayers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("Fetching active players from NBA Stats API...");

  const res = await fetch(
    "https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=2025-26&IsOnlyCurrentSeason=1",
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

  // Clear existing rows then insert fresh
  const { error: deleteError } = await supabase
    .from("nba_players")
    .delete()
    .not("id", "is", null);

  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const { error: insertError } = await supabase
    .from("nba_players")
    .insert(players);

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  console.log(`Done — ${players.length} players seeded into nba_players.`);
}

seedPlayers().catch((err) => {
  console.error(err);
  process.exit(1);
});
