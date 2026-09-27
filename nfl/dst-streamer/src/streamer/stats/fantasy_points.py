"""D/ST fantasy points per team-game, from play-by-play + schedules, under a scoring preset.

Components (counts per game, credited to the defending team):
  sack, interception, fumble_recovery, forced_fumble   defensive (non special teams) plays
  st_fumble_recovery, st_forced_fumble                 special teams plays
  safety, blocked_kick, def_td, st_td
  points_allowed                                       under the preset's pa_basis
  yards_allowed                                        opponent's scrimmage yards (ESPN tiers)
"""

from pathlib import Path

import polars as pl
import yaml

from streamer.stats.games import reg_plays, snap_plays, team_games

SCORING_DIR = Path(__file__).resolve().parents[3] / "config" / "scoring"
COUNT_STATS = [
    "sack",
    "interception",
    "fumble_recovery",
    "forced_fumble",
    "st_fumble_recovery",
    "st_forced_fumble",
    "safety",
    "blocked_kick",
    "def_td",
    "st_td",
]

# nflverse leaves special_teams_play unset on some field goals (e.g. blocked FG returns).
st = (pl.col("special_teams_play") == 1) | pl.col("play_type").is_in(
    ["kickoff", "punt", "field_goal", "extra_point"]
)
td_by = pl.col("touchdown") == 1


def load_preset(name: str) -> dict:
    return yaml.safe_load((SCORING_DIR / f"{name}.yaml").read_text())


def _events(plays: pl.DataFrame) -> pl.DataFrame:
    """Long frame of (game_id, team, stat), one row per credited event."""
    # A fumble recovery counts for whichever team recovers the other team's fumble, even
    # the original offense recovering on an interception return (Sleeper does the same).
    # A forced fumble on a regular play counts only for the defense.
    takeaway = pl.col("fumble_recovery_1_team") != pl.col("fumbled_1_team")
    forced_by_defense = pl.col("forced_fumble_player_1_team") == pl.col("defteam")
    kickoff_return_td = (pl.col("kickoff_attempt") == 1) & (pl.col("td_team") == pl.col("posteam"))
    blocked = (
        (pl.col("punt_blocked") == 1)
        | (pl.col("field_goal_result") == "blocked")
        | (pl.col("extra_point_result") == "blocked")
    )
    sources = [
        ("sack", pl.col("sack") == 1, "defteam"),
        ("interception", pl.col("interception") == 1, "defteam"),
        ("safety", pl.col("safety") == 1, "defteam"),
        ("blocked_kick", blocked, "defteam"),
        ("fumble_recovery", ~st & takeaway, "fumble_recovery_1_team"),
        ("st_fumble_recovery", st & takeaway, "fumble_recovery_1_team"),
        (
            "forced_fumble",
            ~st & (pl.col("fumble_forced") == 1) & forced_by_defense,
            "forced_fumble_player_1_team",
        ),
        ("st_forced_fumble", st & (pl.col("fumble_forced") == 1), "forced_fumble_player_1_team"),
        ("def_td", ~st & td_by & (pl.col("td_team") == pl.col("defteam")), "td_team"),
        (
            "st_td",
            st & td_by & ((pl.col("td_team") == pl.col("defteam")) | kickoff_return_td),
            "td_team",
        ),
    ]
    return pl.concat(
        plays.filter(cond & pl.col(col).is_not_null()).select(
            "game_id", team=pl.col(col), stat=pl.lit(name)
        )
        for name, cond, col in sources
    )


def components(pbp: pl.DataFrame, schedules: pl.DataFrame) -> pl.DataFrame:
    """One row per team per played regular-season game with every scoring component.

    points_allowed_total is the opponent's final score. points_allowed_offense_only
    removes points the opponent's defense scored against this team's offense: 6 per
    defensive TD (pick-six, fumble return) and 2 per safety. Special teams TDs still count.
    This matched Sleeper's pts_allow on all 544 team-weeks of 2025.
    """
    plays = reg_plays(pbp)
    counts = (
        _events(plays)
        .group_by("game_id", "team", "stat")
        .len()
        .pivot(on="stat", index=["game_id", "team"], values="len")
    )
    # Yards allowed: the opponent's net yards on scrimmage plays (sacks included).
    yards = (
        snap_plays(plays)
        .group_by("game_id", team="defteam")
        .agg(yards_allowed=pl.col("yards_gained").sum().cast(pl.Int32))
    )
    games = (
        team_games(schedules)
        .join(counts, on=["game_id", "team"], how="left")
        .join(yards, on=["game_id", "team"], how="left")
    )
    # Signed ints: len() gives UInt32, and negative fantasy points would underflow to null.
    games = games.with_columns(
        [
            (pl.col(s).fill_null(0) if s in games.columns else pl.lit(0)).cast(pl.Int32).alias(s)
            for s in COUNT_STATS
        ]
    )
    # The opponent's def_td and safeties in this game were scored against this team's offense.
    opp = games.select("game_id", team="opponent", opp_def_td="def_td", opp_safety="safety")
    return games.join(opp, on=["game_id", "team"]).with_columns(
        points_allowed_total=pl.col("points_against"),
        points_allowed_offense_only=pl.col("points_against")
        - 6 * pl.col("opp_def_td")
        - 2 * pl.col("opp_safety"),
    )


def _tier_points(points_allowed: pl.Expr, tiers: list[dict]) -> pl.Expr:
    """tiers: [{max: 0, points: 10}, {max: 6, points: 7}, ..., {points: -4}] (last has no max)."""
    expr = pl.lit(tiers[-1]["points"])
    for tier in reversed(tiers[:-1]):
        expr = pl.when(points_allowed <= tier["max"]).then(pl.lit(tier["points"])).otherwise(expr)
    return expr


def score(comps: pl.DataFrame, preset: dict) -> pl.DataFrame:
    """Add dst_fpts: weighted component counts plus the points-allowed tier, plus the
    yards-allowed tier when the preset has one (ESPN)."""
    pa = pl.col(f"points_allowed_{preset['pa_basis']}")
    weighted = [pl.col(stat) * weight for stat, weight in preset["points"].items()]
    fpts = pl.sum_horizontal(weighted) + _tier_points(pa, preset["points_allowed_tiers"])
    if "yards_allowed_tiers" in preset:
        fpts = fpts + _tier_points(pl.col("yards_allowed"), preset["yards_allowed_tiers"])
    return comps.with_columns(dst_fpts=fpts)
