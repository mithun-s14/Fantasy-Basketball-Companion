export interface RosterPlayer {
  id: string;          // UUID
  player_name: string;
  nba_team: string;
  created_at: string;  // ISO 8601
  // user_id intentionally omitted — not needed client-side
}

export interface PlayerStats {
  id: string;
  player_name: string;
  nba_team: string;
  stat_type: 'season' | 'last10';
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  three_pm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  updated_at: string;
}

export interface OpponentPlayer {
  id: string;
  player_name: string;
  nba_team: string;
  created_at: string;
}
