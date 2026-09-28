"""Matchup and context columns for a week, from the nflverse schedule."""

import polars as pl

from streamer.ingest.nflverse import kickoffs_utc


def week_matchups(schedules: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """One row per team playing that week. Teams on bye are absent.

    temp_f / wind_mph are filled by nflverse only after a game is played, so they are
    usually null for the upcoming week.
    """
    games = schedules.filter(
        (pl.col("season") == season) & (pl.col("week") == week) & (pl.col("game_type") == "REG")
    ).with_columns(kickoff_utc=kickoffs_utc(schedules))
    shared = [
        "kickoff_utc",
        "roof",
        pl.col("temp").alias("temp_f"),
        pl.col("wind").alias("wind_mph"),
        (pl.col("div_game") == 1).alias("is_divisional"),
    ]
    home = games.select(
        *shared, team="home_team", opponent="away_team", is_home=pl.lit(True), rest_days="home_rest"
    )
    away = games.select(
        *shared,
        team="away_team",
        opponent="home_team",
        is_home=pl.lit(False),
        rest_days="away_rest",
    )
    return pl.concat([home, away]).select(
        "team",
        "opponent",
        "is_home",
        "rest_days",
        "is_divisional",
        "roof",
        "temp_f",
        "wind_mph",
        "kickoff_utc",
    )
