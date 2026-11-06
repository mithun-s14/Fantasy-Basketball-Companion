import { createServerSupabaseClient } from "@/lib/supabase";
import type { TeamStatRow } from "./teamrankings";

const OPP_FGM = "opponent-field-goals-made-per-game";
const FGA = "field-goal-attempts-per-game";

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
}

export interface KickerPick extends Matchup {
  teamFga: number;
  oppFgmAllowed: number;
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
      return [{ ...m, teamFga, oppFgmAllowed }];
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
      return [a, b].map((c) => ({
        team: c.team.displayName,
        opponent: (c === a ? b : a).team.displayName,
        home: c.homeAway === "home",
        indoor,
        weather,
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
    .in("stat", [OPP_FGM, FGA])
    .order("season", { ascending: false });
  if (error) throw error;
  const latest = data[0]?.season;
  return data.filter((r) => r.season === latest);
}
