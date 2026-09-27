"""`streamer ingest`: cache nflverse + Sleeper data and append an odds snapshot.

Layout (relative to the working directory, git-ignored):
  data/cache/{dataset}_{season}.parquet   overwritten each run (previous season: written once)
  data/cache/schedules_all.parquet        every season since 1999, for QB career starts
  data/cache/sleeper_players.parquet      refetched at most once per 24 hours
  data/snapshots/odds/{season}/{utc timestamp}.parquet   append-only
"""

import time
from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from streamer.ingest import espn, nflverse, sleeper

CACHE = Path("data/cache")
SNAPSHOTS = Path("data/snapshots/odds")
LAST_WEEK = 18
DAY = 24 * 60 * 60


def _write(df: pl.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(path)
    print(f"  wrote {path} ({df.height} rows)")


def ingest(
    season: int | None = None, week: int | None = None, now: datetime | None = None
) -> tuple[int, int, pl.DataFrame]:
    """Returns (season, target week, this run's odds snapshot)."""
    now = now or datetime.now(UTC)
    season = season or nflverse.current_season()
    print(f"Ingesting season {season} (previous season {season - 1} for early-season context)")

    for dataset in ("schedules", "pbp"):
        prev = CACHE / f"{dataset}_{season - 1}.parquet"
        # A finished season doesn't change, so fetch it once.
        if not prev.exists():
            _write(nflverse.load(dataset, season - 1), prev)
    for dataset in ("schedules", "pbp", "injuries", "depth_charts"):
        _write(nflverse.load(dataset, season), CACHE / f"{dataset}_{season}.parquet")
    _write(nflverse.load_all_schedules(), CACHE / "schedules_all.parquet")

    schedules = pl.read_parquet(CACHE / f"schedules_{season}.parquet")
    week = week or nflverse.target_week(schedules, now)
    weeks = [w for w in (week, week + 1) if w <= LAST_WEEK]
    odds = pl.concat(
        [espn.parse_odds(espn.fetch_scoreboard(season, w), season, w, now) for w in weeks]
    )
    _write(odds, SNAPSHOTS / str(season) / f"{now:%Y%m%dT%H%M%SZ}.parquet")

    players = CACHE / "sleeper_players.parquet"
    if not players.exists() or time.time() - players.stat().st_mtime > DAY:
        parsed = sleeper.parse_players(sleeper.fetch_players())
        _write(sleeper.fill_gsis_ids(parsed, nflverse.load_player_ids()), players)

    print(f"Done: season {season}, target week {week}, odds for weeks {weeks}")
    return season, week, odds
