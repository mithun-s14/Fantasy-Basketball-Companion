"""nflverse data via nflreadpy. Seasons are labeled by start year (2026 = the 2026-27 season)."""

from datetime import datetime

import nflreadpy as nfl
import polars as pl

from streamer.http import retry

# nflreadpy wraps every download failure (HTTP or network) in ConnectionError.
LOADERS = {
    "schedules": nfl.load_schedules,
    "pbp": nfl.load_pbp,
    "injuries": nfl.load_injuries,
    "depth_charts": nfl.load_depth_charts,
}


def current_season() -> int:
    return nfl.get_current_season()


def load(dataset: str, season: int) -> pl.DataFrame:
    return retry(
        lambda: LOADERS[dataset]([season]),
        lambda e: isinstance(e, ConnectionError),
        what=f"nflverse {dataset} {season}",
    )


def kickoffs_utc(schedules: pl.DataFrame) -> pl.Series:
    # nflverse gameday/gametime are US Eastern local time.
    return (
        (pl.col("gameday") + " " + pl.col("gametime"))
        .str.to_datetime("%Y-%m-%d %H:%M")
        .dt.replace_time_zone("America/New_York")
        .dt.convert_time_zone("UTC")
    )


def target_week(schedules: pl.DataFrame, now: datetime) -> int:
    """Earliest regular-season week with a game kicking off after now (PRD section 9)."""
    upcoming = schedules.filter((pl.col("game_type") == "REG") & (kickoffs_utc(schedules) > now))
    if upcoming.is_empty():
        raise RuntimeError("No upcoming regular-season games in the schedule")
    return int(upcoming["week"].min())
