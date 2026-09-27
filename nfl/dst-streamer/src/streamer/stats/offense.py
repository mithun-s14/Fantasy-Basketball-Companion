"""Opposing-offense columns: per team as the offense, season to date."""

import polars as pl

from streamer.stats.games import play_totals


def offense_stats(plays: pl.DataFrame, scored: pl.DataFrame) -> pl.DataFrame:
    """plays: season-to-date regular-season plays. scored: fantasy_points.score() rows for the
    same games (one per defense per game), used for games played, points and FPA.

    points_per_game is all points scored (offense-only points aren't separated yet).
    fpa_to_dst: average D/ST fantasy points the defenses facing this offense scored.
    """
    per_team = scored.group_by(team="team").agg(
        games=pl.len(), points_per_game=pl.col("points_for").mean()
    )
    fpa = scored.group_by(team="opponent").agg(fpa_to_dst=pl.col("dst_fpts").mean())
    return (
        play_totals(plays, "posteam")
        .join(per_team, on="team")
        .join(fpa, on="team")
        .select(
            "team",
            "games",
            sack_rate_allowed=pl.col("sacks") / pl.col("dropbacks"),
            giveaways_per_game=pl.col("giveaways") / pl.col("games"),
            points_per_game="points_per_game",
            yards_per_play=pl.col("yards") / pl.col("plays"),
            fpa_to_dst="fpa_to_dst",
        )
    )
