export const NBA_TEAMS = [
  "Atlanta Hawks",
  "Boston Celtics",
  "Brooklyn Nets",
  "Charlotte Hornets",
  "Chicago Bulls",
  "Cleveland Cavaliers",
  "Dallas Mavericks",
  "Denver Nuggets",
  "Detroit Pistons",
  "Golden State Warriors",
  "Houston Rockets",
  "Indiana Pacers",
  "Los Angeles Clippers",
  "Los Angeles Lakers",
  "Memphis Grizzlies",
  "Miami Heat",
  "Milwaukee Bucks",
  "Minnesota Timberwolves",
  "New Orleans Pelicans",
  "New York Knicks",
  "Oklahoma City Thunder",
  "Orlando Magic",
  "Philadelphia 76ers",
  "Phoenix Suns",
  "Portland Trail Blazers",
  "Sacramento Kings",
  "San Antonio Spurs",
  "Toronto Raptors",
  "Utah Jazz",
  "Washington Wizards",
];

/**
 * NBA season label ("2026-27") for a date. Seasons tip off in October, so
 * from October on the label starts with the current year.
 */
export function currentSeason(date = new Date()): string {
  const start = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The season before: "2026-27" -> "2025-26". */
export function previousSeason(season: string): string {
  const start = Number(season.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Basketball-Reference names a season by its end year: "2025-26" -> 2026. */
export function bbrefSeasonYear(season: string): number {
  return Number(season.slice(0, 4)) + 1;
}

/**
 * Key for matching one player's name across sources (NBA.com, Basketball-Reference,
 * ESPN): ignores accents, case, punctuation and a trailing Jr/Sr/II/III/IV.
 * "Alperen Şengün" and "Alperen Sengun" match, as do "Jimmy Butler" and "Jimmy Butler III".
 */
export function playerNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+(jr|sr|ii|iii|iv)\.?$/, "")
    .replace(/[^a-z]/g, "");
}
