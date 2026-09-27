"""Sleeper player data: QB depth order and injury status, plus D/ST entries.

GET /v1/players/nfl is ~15 MB, so callers cache it and fetch at most once a day.
"""

import polars as pl

from streamer.http import get_json
from streamer.teams import canon

PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
POSITIONS = {"QB", "DEF"}

SCHEMA = {
    "player_id": pl.String,
    "gsis_id": pl.String,
    "full_name": pl.String,
    "team": pl.String,
    "position": pl.String,
    "status": pl.String,
    "injury_status": pl.String,
    "depth_chart_order": pl.Int32,
    "years_exp": pl.Int32,
}


def fetch_players() -> dict:
    return get_json(PLAYERS_URL)


def parse_players(players: dict) -> pl.DataFrame:
    """QBs and D/STs currently on an NFL team. D/ST player_id is the team abbreviation."""
    rows = [
        {
            "player_id": pid,
            "gsis_id": (p.get("gsis_id") or "").strip() or None,
            "full_name": p.get("full_name") or f"{p.get('first_name')} {p.get('last_name')}",
            "team": canon(p["team"]),
            "position": p["position"],
            "status": p.get("status"),
            "injury_status": p.get("injury_status"),
            "depth_chart_order": p.get("depth_chart_order"),
            "years_exp": p.get("years_exp"),
        }
        for pid, p in players.items()
        if p.get("position") in POSITIONS and p.get("team")
    ]
    return pl.DataFrame(rows, schema=SCHEMA)


def fill_gsis_ids(players: pl.DataFrame, id_map: pl.DataFrame) -> pl.DataFrame:
    """Fill missing gsis_id from nflverse's player ID map (sleeper_id -> gsis_id).

    Sleeper leaves gsis_id empty for many players (15 of 32 starting QBs on 2026-09-27),
    and gsis_id is the key into nflverse play-by-play and schedules.
    """
    bridge = (
        id_map.select(player_id=pl.col("sleeper_id").cast(pl.String), bridge_gsis=pl.col("gsis_id"))
        .drop_nulls()
        .unique("player_id")
    )
    return (
        players.join(bridge, on="player_id", how="left")
        .with_columns(gsis_id=pl.coalesce("gsis_id", "bridge_gsis"))
        .drop("bridge_gsis")
    )


def fetch_week_stats(season: int, week: int) -> dict:
    """Per-player regular-season stats for one week; D/ST rows are keyed by team abbreviation."""
    return get_json(f"https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week}")
