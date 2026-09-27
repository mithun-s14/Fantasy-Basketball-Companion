"""The D/ST's own columns: per team as the defense, season to date."""

import polars as pl

from streamer.stats.games import play_totals


def defense_stats(plays: pl.DataFrame, scored: pl.DataFrame) -> pl.DataFrame:
    """plays: season-to-date regular-season plays. scored: fantasy_points.score() rows.

    takeaways are interceptions + all fumble recoveries, special teams included, which is
    how ESPN's official totalTakeaways counts them (matched for BUF, DAL, KC, PHI, SF in
    2025). return_tds are defensive + special teams TDs.
    """
    per_game = scored.group_by("team").agg(
        games=pl.len(),
        sacks=pl.col("sack").sum(),
        takeaways=(
            pl.col("interception") + pl.col("fumble_recovery") + pl.col("st_fumble_recovery")
        ).sum(),
        points_allowed_per_game=pl.col("points_against").mean(),
        dst_fpts_per_game=pl.col("dst_fpts").mean(),
        return_tds=(pl.col("def_td") + pl.col("st_td")).sum(),
    )
    faced = play_totals(plays, "defteam").select(
        "team", opp_dropbacks="dropbacks", opp_plays="plays", yards_allowed="yards"
    )
    return per_game.join(faced, on="team").select(
        "team",
        "games",
        sacks_per_game=pl.col("sacks") / pl.col("games"),
        sack_rate=pl.col("sacks") / pl.col("opp_dropbacks"),
        takeaways_per_game=pl.col("takeaways") / pl.col("games"),
        points_allowed_per_game="points_allowed_per_game",
        yards_per_play_allowed=pl.col("yards_allowed") / pl.col("opp_plays"),
        dst_fpts_per_game="dst_fpts_per_game",
        return_tds="return_tds",
    )
