"""`streamer validate-points`: compare PBP-derived D/ST points with Sleeper's own stats.

The reference for each team-week is the preset applied to Sleeper's per-stat D/ST counts
(and, for sleeper_default, Sleeper's reported pts_std), so any gap comes from how this
pipeline counts sacks, takeaways, TDs and points allowed from play-by-play.
"""

import polars as pl

from streamer.ingest import sleeper
from streamer.stats.fantasy_points import COUNT_STATS, components, score
from streamer.teams import TEAMS, canon

TOLERANCE = 0.5
MAX_MISS_RATE = 0.02
MIN_SAMPLE = 20

# Our component name -> Sleeper stat key.
SLEEPER_KEYS = {
    "sack": "sack",
    "interception": "int",
    "fumble_recovery": "fum_rec",
    "forced_fumble": "ff",
    "st_fumble_recovery": "def_st_fum_rec",
    "st_forced_fumble": "def_st_ff",
    "safety": "safe",
    "blocked_kick": "blk_kick",
    "def_td": "def_td",
    "st_td": "def_st_td",
}
DST_IDS = set(TEAMS) | {"LAR"}


def sleeper_components(weeks: dict[int, dict]) -> pl.DataFrame:
    rows = [
        {
            "week": week,
            "team": canon(team),
            **{ours: float(s.get(key) or 0) for ours, key in SLEEPER_KEYS.items()},
            "points_allowed_offense_only": float(s.get("pts_allow") or 0),
            "yards_allowed": float(s.get("yds_allow") or 0),
            "sleeper_pts_std": float(s.get("pts_std") or 0),
        }
        for week, stats in weeks.items()
        for team, s in stats.items()
        if team in DST_IDS and s.get("gp")
    ]
    return pl.DataFrame(rows)


def compare(ours: pl.DataFrame, reference: pl.DataFrame, preset: dict) -> pl.DataFrame:
    ref = score(reference.with_columns(points_allowed_total=pl.lit(None)), preset)
    return (
        score(ours, preset)
        .join(
            ref.select("week", "team", "sleeper_pts_std", ref_fpts="dst_fpts"), on=["week", "team"]
        )
        .with_columns(diff=pl.col("dst_fpts") - pl.col("ref_fpts"))
    )


def validate_points(season: int, preset_name: str, pbp, schedules, preset: dict) -> bool:
    ours = components(pbp, schedules).filter(pl.col("season") == season)
    weeks = sorted(ours["week"].unique().to_list())
    reference = sleeper_components({w: sleeper.fetch_week_stats(season, w) for w in weeks})
    result = compare(ours, reference, preset)

    # A null diff (missing value on either side) is a miss, never a silent pass.
    misses = result.filter(pl.col("diff").is_null() | (pl.col("diff").abs() > TOLERANCE))
    rate = misses.height / result.height if result.height else 1.0
    print(f"{preset_name}, {season}: {result.height} team-weeks compared with Sleeper")
    print(f"  within +/-{TOLERANCE}: {result.height - misses.height}, outside: {misses.height}")
    if preset_name == "sleeper_default":
        exact = result.filter(pl.col("dst_fpts") == pl.col("sleeper_pts_std")).height
        print(f"  equal to Sleeper's reported pts_std: {exact}")
    if misses.height:
        cols = ["week", "team", "opponent", "dst_fpts", "ref_fpts", *COUNT_STATS]
        print(misses.select(cols).sort("week", "team"))
    ok = result.height >= MIN_SAMPLE and rate <= MAX_MISS_RATE
    verdict = "PASS" if ok else "FAIL"
    print(f"  {verdict} (needs >= {MIN_SAMPLE} team-weeks, <= {MAX_MISS_RATE:.0%} outside)")
    return ok
