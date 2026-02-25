export interface NBAPlayer {
  name: string;
  team: string;
}

// Maps NBA Stats API team abbreviations to the full names used in NBA_TEAMS
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

let cachedPlayers: NBAPlayer[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days since trade deadline passed

export async function getActivePlayers(): Promise<NBAPlayer[]> {
  if (cachedPlayers && Date.now() < cacheExpiry) {
    return cachedPlayers;
  }

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

  const players: NBAPlayer[] = rows
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cachedPlayers = players;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return players;
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
