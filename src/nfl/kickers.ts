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
  kickoff: string; // ISO
}

export interface KickerPick extends Matchup {
  teamFga: number;
  oppFgmAllowed: number;
  /** Opponent FG made allowed/game minus this team's FG attempts/game. */
  edge: number;
}

// ponytail: edge is a plain difference, so a low-volume offense facing a leaky
// defense outranks a high-volume one facing the same defense. Blend in raw
// volume (e.g. rank on teamFga + oppFgmAllowed) if that bites.
export function rankKickers(
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
      return [{ ...m, teamFga, oppFgmAllowed, edge: oppFgmAllowed - teamFga }];
    })
    .sort((a, b) => b.edge - a.edge);
}

interface EspnScoreboard {
  week: { number: number };
  events: {
    date: string;
    status: { type: { state: "pre" | "in" | "post" } };
    competitions: {
      competitors: {
        homeAway: "home" | "away";
        team: { displayName: string };
      }[];
    }[];
  }[];
}

// ESPN's public scoreboard returns the current NFL week. Each game yields two
// matchups, one per kicker. Teams on bye simply don't appear, and games that
// have kicked off are dropped since picking up that kicker is too late.
export async function fetchWeekMatchups(): Promise<{
  week: number;
  matchups: Matchup[];
}> {
  const res = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
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
      return [a, b].map((c) => ({
        team: c.team.displayName,
        opponent: (c === a ? b : a).team.displayName,
        home: c.homeAway === "home",
        kickoff: e.date,
      }));
    });
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
