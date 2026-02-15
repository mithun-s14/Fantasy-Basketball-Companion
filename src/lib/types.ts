export interface Game {
  id: number;
  game_date: string;
  home_team: string;
  away_team: string;
  season: string;
  venue: string | null;
  bbref_url: string | null;
  created_at: string;
}

export interface GameCountsResponse {
  gameCounts: Record<string, number>;
  totalGames: number;
  dateRange: {
    start: string;
    end: string;
  };
}
