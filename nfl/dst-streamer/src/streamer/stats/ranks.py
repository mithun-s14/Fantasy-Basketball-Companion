"""League ranks where 1 = most favorable for the D/ST."""

import polars as pl

# Column -> True when a higher value is better for the D/ST streaming against it.
HIGHER_IS_BETTER = {
    "opp_qb_sack_rate": True,
    "opp_qb_int_rate": True,
    "opp_qb_fumble_rate": True,
    "opp_sack_rate_allowed": True,
    "opp_giveaways_per_game": True,
    "opp_points_per_game": False,
    "opp_yards_per_play": False,
    "opp_fpa_to_dst": True,
    "def_sacks_per_game": True,
    "def_sack_rate": True,
    "def_takeaways_per_game": True,
    "def_points_allowed_per_game": False,
    "def_yards_per_play_allowed": False,
    "dst_fpts_per_game": True,
}


def add_ranks(df: pl.DataFrame) -> pl.DataFrame:
    """Add `<col>_rank` for every rankable column present. Ties share the best rank."""
    return df.with_columns(
        pl.col(col).rank("min", descending=higher).cast(pl.Int32).alias(f"{col}_rank")
        for col, higher in HIGHER_IS_BETTER.items()
        if col in df.columns
    )
