from datetime import UTC, datetime

import polars as pl
import pytest

from streamer.ingest import espn, nflverse, run, sleeper
from streamer.ingest.nflverse import target_week


def schedule(*games):
    return pl.DataFrame(
        [
            {"week": w, "gameday": d, "gametime": t, "game_type": "REG", "home_team": "KC"}
            for w, d, t in games
        ]
    )


IDS = pl.DataFrame({"sleeper_id": ["1"], "gsis_id": ["00-1"]})
SCHED = schedule(
    (3, "2026-09-24", "20:15"),  # TNF
    (3, "2026-09-27", "13:00"),
    (3, "2026-09-28", "20:15"),  # MNF
    (4, "2026-10-01", "20:15"),
    (4, "2026-10-04", "13:00"),
)


@pytest.mark.parametrize(
    ("now", "week"),
    [
        (datetime(2026, 9, 26, 12, tzinfo=UTC), 3),  # Saturday: Sunday games still ahead
        (datetime(2026, 9, 29, 0, 14, tzinfo=UTC), 3),  # 1 min before MNF (8:15pm EDT)
        (datetime(2026, 9, 29, 11, 7, tzinfo=UTC), 4),  # Tuesday after MNF
    ],
)
def test_target_week(now, week):
    assert target_week(SCHED, now) == week


def test_target_week_ignores_postseason():
    sched = pl.concat(
        [SCHED, schedule((19, "2027-01-09", "16:30")).with_columns(game_type=pl.lit("WC"))]
    )
    with pytest.raises(RuntimeError, match="No upcoming"):
        target_week(sched, datetime(2026, 12, 1, tzinfo=UTC))


def test_ingest_writes_caches_and_appends_snapshots(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    loads = []

    def fake_load(dataset, season):
        loads.append((dataset, season))
        return SCHED if dataset == "schedules" else pl.DataFrame({"season": [season]})

    fetched_weeks, player_fetches = [], []
    monkeypatch.setattr(nflverse, "load", fake_load)
    monkeypatch.setattr(nflverse, "current_season", lambda: 2026)
    monkeypatch.setattr(nflverse, "load_all_schedules", lambda: SCHED)
    monkeypatch.setattr(nflverse, "load_player_ids", lambda: IDS)
    monkeypatch.setattr(
        espn, "fetch_scoreboard", lambda s, w: fetched_weeks.append(w) or {"events": []}
    )
    monkeypatch.setattr(sleeper, "fetch_players", lambda: player_fetches.append(1) or {})

    now = datetime(2026, 9, 26, 12, tzinfo=UTC)
    season, week, odds = run.ingest(now=now)
    assert (season, week, odds.height) == (2026, 3, 0)
    assert set(loads) == {
        ("schedules", 2025), ("pbp", 2025),
        ("schedules", 2026), ("pbp", 2026), ("injuries", 2026), ("depth_charts", 2026),
    }  # fmt: skip
    assert fetched_weeks == [3, 4]  # target week + lookahead

    # Second run the same day: previous season and Sleeper come from cache, odds append.
    loads.clear()
    run.ingest(now=now.replace(hour=13))
    assert ("pbp", 2025) not in loads and ("pbp", 2026) in loads
    assert len(player_fetches) == 1
    assert len(list((tmp_path / "data/snapshots/odds/2026").glob("*.parquet"))) == 2


def test_week_18_has_no_lookahead(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        nflverse, "load", lambda d, s: SCHED if d == "schedules" else pl.DataFrame()
    )
    monkeypatch.setattr(nflverse, "load_all_schedules", lambda: SCHED)
    monkeypatch.setattr(nflverse, "load_player_ids", lambda: IDS)
    weeks = []
    monkeypatch.setattr(espn, "fetch_scoreboard", lambda s, w: weeks.append(w) or {"events": []})
    monkeypatch.setattr(sleeper, "fetch_players", lambda: {})
    run.ingest(season=2026, week=18, now=datetime(2026, 9, 26, tzinfo=UTC))
    assert weeks == [18]
