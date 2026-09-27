"""Tiny hand-built nflverse-shaped frames for stat tests."""

import polars as pl

PLAY_DEFAULTS = {
    "season": 2026,
    "week": 1,
    "season_type": "REG",
    "game_id": "G1",
    "play_deleted": 0.0,
    "play_type": "run",
    "special_teams_play": 0.0,
    "posteam": "KC",
    "defteam": "BUF",
    "qb_dropback": 0.0,
    "sack": 0.0,
    "interception": 0.0,
    "complete_pass": 0.0,
    "incomplete_pass": 0.0,
    "rush_attempt": 0.0,
    "yards_gained": 0.0,
    "safety": 0.0,
    "touchdown": 0.0,
    "td_team": None,
    "kickoff_attempt": 0.0,
    "punt_blocked": 0.0,
    "field_goal_result": None,
    "extra_point_result": None,
    "fumble": 0.0,
    "fumble_lost": 0.0,
    "fumble_forced": 0.0,
    "fumbled_1_team": None,
    "fumbled_1_player_id": None,
    "fumble_recovery_1_team": None,
    "forced_fumble_player_1_team": None,
    "two_point_attempt": 0.0,
    "passer_id": None,
    "rusher_id": None,
}


def plays(*rows: dict) -> pl.DataFrame:
    return pl.DataFrame([PLAY_DEFAULTS | r for r in rows], infer_schema_length=None)


def schedule(*games: tuple) -> pl.DataFrame:
    """games: (game_id, week, home, away, home_score, away_score); None scores = unplayed."""
    return pl.DataFrame(
        [
            {
                "game_id": g,
                "season": 2026,
                "week": w,
                "game_type": "REG",
                "gameday": "2026-09-13",
                "gametime": "13:00",
                "home_team": h,
                "away_team": a,
                "home_score": hs,
                "away_score": as_,
                "result": None if hs is None else hs - as_,
            }
            for g, w, h, a, hs, as_ in games
        ],
        infer_schema_length=None,
    )
