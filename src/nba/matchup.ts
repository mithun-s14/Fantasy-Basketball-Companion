import type { PlayerStats, RosterPlayer } from "./types";

type StatCategory =
  | "pts" | "reb" | "ast" | "stl" | "blk"
  | "tov" | "three_pm" | "fg_pct" | "ft_pct";

export interface CategoryResult {
  category: StatCategory;
  label: string;
  userTotal: number;
  opponentTotal: number;
  winner: "user" | "opponent" | "tie";
}

export interface MatchupResult {
  categories: CategoryResult[];
  userWins: number;
  opponentWins: number;
}

const CATEGORY_DEFS: {
  category: StatCategory;
  label: string;
  lowerWins?: boolean;
}[] = [
  { category: "pts",      label: "PTS" },
  { category: "reb",      label: "REB" },
  { category: "ast",      label: "AST" },
  { category: "stl",      label: "STL" },
  { category: "blk",      label: "BLK" },
  { category: "three_pm", label: "3PM" },
  { category: "fg_pct",   label: "FG%" },
  { category: "ft_pct",   label: "FT%" },
  { category: "tov",      label: "TO",  lowerWins: true },
];

export function computeMatchup(
  userRoster: RosterPlayer[],
  opponentRoster: RosterPlayer[],
  stats: PlayerStats[],
  gameCounts: Record<string, number>,
  statType: "season" | "last10"
): MatchupResult {
  // Index stats by normalized name + stat_type
  const statsMap = new Map<string, PlayerStats>();
  for (const s of stats) {
    if (s.stat_type === statType) {
      statsMap.set(s.player_name.normalize("NFC").toLowerCase(), s);
    }
  }

  function getStats(player: RosterPlayer): PlayerStats | null {
    return statsMap.get(player.player_name.normalize("NFC").toLowerCase()) ?? null;
  }

  function games(player: RosterPlayer): number {
    return gameCounts[player.nba_team] ?? 0;
  }

  function sumCounting(
    roster: RosterPlayer[],
    key: keyof Pick<PlayerStats, "pts"|"reb"|"ast"|"stl"|"blk"|"tov"|"three_pm">
  ): number {
    return roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[key] * games(p) : acc;
    }, 0);
  }

  function weightedPct(
    roster: RosterPlayer[],
    madeKey: "fgm" | "ftm",
    attKey: "fga" | "fta"
  ): number {
    const made = roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[madeKey] * games(p) : acc;
    }, 0);
    const att = roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[attKey] * games(p) : acc;
    }, 0);
    return att === 0 ? 0 : made / att;
  }

  const categories: CategoryResult[] = CATEGORY_DEFS.map(
    ({ category, label, lowerWins }) => {
      let userTotal: number;
      let opponentTotal: number;

      if (category === "fg_pct") {
        userTotal = weightedPct(userRoster, "fgm", "fga");
        opponentTotal = weightedPct(opponentRoster, "fgm", "fga");
      } else if (category === "ft_pct") {
        userTotal = weightedPct(userRoster, "ftm", "fta");
        opponentTotal = weightedPct(opponentRoster, "ftm", "fta");
      } else {
        userTotal = sumCounting(userRoster, category);
        opponentTotal = sumCounting(opponentRoster, category);
      }

      let winner: "user" | "opponent" | "tie";
      if (userTotal === opponentTotal) {
        winner = "tie";
      } else if (lowerWins) {
        winner = userTotal < opponentTotal ? "user" : "opponent";
      } else {
        winner = userTotal > opponentTotal ? "user" : "opponent";
      }

      return { category, label, userTotal, opponentTotal, winner };
    }
  );

  const userWins = categories.filter((c) => c.winner === "user").length;
  const opponentWins = categories.filter((c) => c.winner === "opponent").length;

  return { categories, userWins, opponentWins };
}
