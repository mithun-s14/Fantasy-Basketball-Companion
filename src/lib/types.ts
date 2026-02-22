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

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  url: string;
}

export interface RosterPlayer {
  id: string;          // UUID
  player_name: string;
  nba_team: string;
  created_at: string;  // ISO 8601
  // user_id intentionally omitted — not needed client-side
}
