"""Shared helpers: regular-season plays and one row per team per played game."""

import polars as pl


def reg_plays(pbp: pl.DataFrame) -> pl.DataFrame:
    """Regular-season plays that stand (drops deleted plays; keeps penalty no_plays)."""
    return pbp.filter((pl.col("season_type") == "REG") & (pl.col("play_deleted") != 1))


def team_games(schedules: pl.DataFrame) -> pl.DataFrame:
    """One row per team per finished regular-season game, from that team's side."""
    done = schedules.filter((pl.col("game_type") == "REG") & pl.col("result").is_not_null())
    side = ["game_id", "season", "week", "gameday"]
    home = done.select(
        *side,
        team="home_team",
        opponent="away_team",
        is_home=pl.lit(True),
        points_for="home_score",
        points_against="away_score",
    )
    away = done.select(
        *side,
        team="away_team",
        opponent="home_team",
        is_home=pl.lit(False),
        points_for="away_score",
        points_against="home_score",
    )
    return pl.concat([home, away])


def before(df: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Season-to-date rows: this season, weeks before the target week."""
    return df.filter((pl.col("season") == season) & (pl.col("week") < week))


def snap_plays(plays: pl.DataFrame) -> pl.DataFrame:
    """Scrimmage plays that count for rates: passes (incl. sacks, scrambles) and runs.
    Two-point tries are excluded (they aren't scrimmage plays in official stats)."""
    return plays.filter(
        pl.col("play_type").is_in(["pass", "run"]) & (pl.col("two_point_attempt") != 1)
    )


def play_totals(plays: pl.DataFrame, by: str) -> pl.DataFrame:
    """Per team (as `by` = posteam or defteam): dropbacks, sacks, plays, yards, giveaways."""
    return (
        snap_plays(plays)
        .group_by(team=pl.col(by))
        .agg(
            dropbacks=pl.col("qb_dropback").sum(),
            sacks=pl.col("sack").sum(),
            plays=pl.len(),
            yards=pl.col("yards_gained").sum(),
            giveaways=pl.col("interception").sum() + pl.col("fumble_lost").sum(),
        )
    )
