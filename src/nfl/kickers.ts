import { createServerSupabaseClient } from "@/lib/supabase";
import type { TeamStatRow } from "./teamrankings";

const OPP_FGM = "opponent-field-goals-made-per-game";
const FGA = "field-goal-attempts-per-game";
// Red zone TD rate (TD only, as a 0–1 fraction). Low means more drives stall into FGs.
const RZ_TD = "red-zone-scoring-pct";
const OPP_RZ_TD = "opponent-red-zone-scoring-pct";

// Which scraped column to rank on. Early in a season the current-season
// numbers are 1–3 games of noise, so last season is offered too.
export const BASES = {
  season_avg: "This season",
  last3: "Last 3",
  prev_season_avg: "Last season",
} as const;
export type Basis = keyof typeof BASES;

export interface Matchup {
  team: string;
  opponent: string;
  home: boolean;
  /** ESPN marks domes and retractable roofs alike as indoor. */
  indoor: boolean;
  /** ESPN/AccuWeather forecast, e.g. "62° Sunny"; only present a few days out. */
  weather?: string;
  /** Points Vegas expects this team to score; null until a line is posted. */
  impliedTotal: number | null;
}

export interface KickerPick extends Matchup {
  teamFga: number;
  oppFgmAllowed: number;
  /** Null until the red zone stats have been scraped. */
  teamRzTd: number | null;
  oppRzTdAllowed: number | null;
}

// Attaches the two raw kicker stats to each matchup. No combined score on
// purpose: two stats aren't enough for a projection, so the reader weighs them.
export function kickerStats(
  matchups: Matchup[],
  stats: Pick<TeamStatRow, "team" | "stat" | Basis>[],
  basis: Basis,
): KickerPick[] {
  const get = (team: string, stat: string) =>
    stats.find((s) => s.team === team && s.stat === stat)?.[basis] ?? null;

  return matchups
    .flatMap((m) => {
      const teamFga = get(m.team, FGA);
      const oppFgmAllowed = get(m.opponent, OPP_FGM);
      if (teamFga === null || oppFgmAllowed === null) return [];
      return [{ ...m, teamFga, oppFgmAllowed, teamRzTd: get(m.team, RZ_TD), oppRzTdAllowed: get(m.opponent, OPP_RZ_TD) }];
    });
}

interface EspnScoreboard {
  week: { number: number };
  events: {
    date: string;
    status: { type: { state: "pre" | "in" | "post" } };
    weather?: { displayValue: string; temperature: number };
    competitions: {
      venue?: { indoor?: boolean };
      // spread is from the home team's side (-10 = home favored by 10).
      odds?: { overUnder?: number; spread?: number }[];
      competitors: {
        homeAway: "home" | "away";
        team: { displayName: string };
      }[];
    }[];
  }[];
}

export const LAST_REGULAR_SEASON_WEEK = 18;

// ESPN's public scoreboard: no week returns the current NFL week, otherwise
// that regular-season week (seasontype=2) of the current season. Each game
// yields two matchups, one per kicker. Teams on bye simply don't appear, and
// games that have kicked off are dropped since picking up that kicker is too late.
export async function fetchWeekMatchups(week?: number): Promise<{
  week: number;
  matchups: Matchup[];
}> {
  const res = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" +
      (week ? `?seasontype=2&week=${week}` : ""),
    {
      next: { revalidate: 3600 },
    },
  );
  if (!res.ok) throw new Error(`ESPN scoreboard failed: ${res.status}`);
  const data: EspnScoreboard = await res.json();

  const matchups = data.events
    .filter((e) => e.status.type.state === "pre")
    .flatMap((e) => {
      const [a, b] = e.competitions[0].competitors;
      const indoor = e.competitions[0].venue?.indoor ?? false;
      const weather = e.weather && `${e.weather.temperature}° ${e.weather.displayValue}`;
      const { overUnder, spread } = e.competitions[0].odds?.[0] ?? {};
      const implied = (home: boolean) =>
        overUnder != null && spread != null ? (overUnder + (home ? -spread : spread)) / 2 : null;
      return [a, b].map((c) => ({
        team: c.team.displayName,
        opponent: (c === a ? b : a).team.displayName,
        home: c.homeAway === "home",
        indoor,
        weather,
        impliedTotal: implied(c.homeAway === "home"),
      }));
    });
  // Midweek ESPN still reports the finished week; roll forward to the next one.
  if (!week && !matchups.length && data.week.number < LAST_REGULAR_SEASON_WEEK) {
    return fetchWeekMatchups(data.week.number + 1);
  }
  return { week: data.week.number, matchups };
}

// Latest season's rows for the two kicker stats.
export async function loadKickerStats() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_team_stats")
    .select("team, season, stat, season_avg, last3, prev_season_avg")
    .in("stat", [OPP_FGM, FGA, RZ_TD, OPP_RZ_TD])
    .order("season", { ascending: false });
  if (error) throw error;
  const latest = data[0]?.season;
  return data.filter((r) => r.season === latest);
}
