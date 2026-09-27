"""Smoke test: `streamer build` end to end on tiny cache files (also run in CI)."""

import json
from datetime import UTC, datetime

import polars as pl
import pytest
from builders import plays, schedule

from streamer import build as build_mod
from streamer import report
from streamer.stats.qb import expected_starters

NOW = datetime(2026, 9, 16, 12, tzinfo=UTC)


def write_caches(tmp_path):
    cache, snaps = tmp_path / "data/cache", tmp_path / "data/snapshots/odds/2026"
    cache.mkdir(parents=True)
    snaps.mkdir(parents=True)
    sched = schedule(
        ("G1", 1, "BUF", "KC", 20, 10),
        ("G2", 2, "KC", "BUF", None, None),
        ("G3", 3, "BUF", "KC", None, None),
    ).with_columns(
        home_qb_id=pl.lit("QB_H"),
        away_qb_id=pl.lit("QB_A"),
        roof=pl.lit("outdoors"),
        temp=pl.lit(None, pl.Int32),
        wind=pl.lit(None, pl.Int32),
        div_game=pl.lit(1),
        home_rest=pl.lit(7),
        away_rest=pl.lit(7),
        gameday=pl.Series(["2026-09-13", "2026-09-20", "2026-09-27"]),
    )
    sched.write_parquet(cache / "schedules_2026.parquet")
    sched.write_parquet(cache / "schedules_all.parquet")
    pbp = plays(
        {
            "posteam": "KC",
            "defteam": "BUF",
            "play_type": "pass",
            "qb_dropback": 1.0,
            "passer_id": "KC1",
            "sack": 1.0,
        },
        {
            "posteam": "BUF",
            "defteam": "KC",
            "play_type": "pass",
            "qb_dropback": 1.0,
            "passer_id": "BUF1",
            "complete_pass": 1.0,
        },
    )
    pbp.write_parquet(cache / "pbp_2026.parquet")
    pbp.with_columns(season=pl.lit(2025)).write_parquet(cache / "pbp_2025.parquet")
    pl.DataFrame(
        {
            "season": [2026],
            "week": [2],
            "team": ["KC"],
            "gsis_id": ["KC1"],
            "position": ["QB"],
            "report_status": ["Out"],
        }
    ).write_parquet(cache / "injuries_2026.parquet")
    pl.DataFrame(
        {
            "player_id": ["1", "2", "3"],
            "gsis_id": ["KC1", "KC2", "BUF1"],
            "full_name": ["Kc Starter", "Kc Backup", "Buf Starter"],
            "team": ["KC", "KC", "BUF"],
            "position": ["QB"] * 3,
            "status": ["Active"] * 3,
            "injury_status": [None] * 3,
            "depth_chart_order": [1, 2, 1],
            "years_exp": [5, 1, 5],
        }
    ).write_parquet(cache / "sleeper_players.parquet")
    pl.DataFrame(
        {
            "fetched_at_utc": [NOW, NOW],
            "season": [2026, 2026],
            "week": [2, 3],
            "espn_game_id": ["2", "3"],
            "home_team": ["KC", "BUF"],
            "away_team": ["BUF", "KC"],
            "provider": ["DraftKings"] * 2,
            "home_spread": [-3.0, -7.5],
            "total": [44.0, 40.0],
            "home_moneyline": [-160, -350],
            "away_moneyline": [135, 280],
        }
    ).write_parquet(snaps / "20260916T120000Z.parquet")


def test_build_end_to_end(tmp_path, monkeypatch):
    write_caches(tmp_path)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(build_mod, "load_overrides", lambda: {})
    docs = build_mod.build(2026, None, ["sleeper_default"], now=NOW)

    doc = json.loads((tmp_path / "data/rankings/2026/week_02.sleeper_default.json").read_text())
    assert doc == docs[0]
    assert (doc["season"], doc["week"], doc["schema_version"], doc["stage"]) == (
        2026,
        2,
        1,
        "manual",
    )
    kc, buf = doc["teams"]  # sorted by opponent implied total, lowest first
    assert (buf["team"], buf["opponent"], buf["is_home"]) == ("BUF", "KC", False)
    # KC -3 at home, total 44: BUF implied (44 - 3) / 2 = 20.5, KC implied 23.5.
    assert (kc["lines"]["opp_implied_total"], buf["lines"]["opp_implied_total"]) == (20.5, 23.5)
    # KC's starter is Out in week 2, so BUF faces the backup, who isn't the Week 1 starter.
    assert (buf["opp_qb"]["name"], buf["opp_qb"]["changed"]) == ("Kc Backup", True)
    assert "BACKUP_QB" in buf["flags"] and "LOW_SAMPLE" in buf["flags"]
    # BUF D/ST in week 1: 1 sack, allowed 10 -> 1 + 4 = 5.
    assert buf["defense"]["dst_fpts_per_game"] == 5.0
    assert buf["next_week"] == {"opponent": "KC", "is_home": True, "opp_implied_total": 16.25}
    md = (tmp_path / "data/rankings/2026/week_02.sleeper_default.md").read_text()
    assert "| BUF | @ KC | 23.5 | +3 | Kc Backup |" in md


def test_override_wins_and_unknown_override_fails():
    players = pl.DataFrame(
        {
            "gsis_id": ["A", "B"],
            "full_name": ["First Guy", "Second Guy"],
            "team": ["LA", "LA"],
            "position": ["QB", "QB"],
            "depth_chart_order": [1, 2],
            "injury_status": [None, None],
        }
    )
    inj = pl.DataFrame(
        schema={
            "season": pl.Int32,
            "week": pl.Int32,
            "position": pl.String,
            "gsis_id": pl.String,
            "report_status": pl.String,
        }
    )
    row = expected_starters(players, inj, 2026, 4, {"LAR": "second guy"}).row(0, named=True)
    assert (row["qb_name"], row["qb_changed"]) == ("Second Guy", True)
    with pytest.raises(ValueError, match="not a LA QB"):
        expected_starters(players, inj, 2026, 4, {"LA": "Nobody"})


def test_publish_upserts_one_row(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    sent = {}

    class Session:
        def post(self, url, json, headers, timeout):
            sent.update(url=url, json=json, headers=headers)
            return type("R", (), {"status_code": 201, "text": ""})()

    doc = {
        "season": 2026,
        "week": 4,
        "scoring_preset": "espn_default",
        "schema_version": 1,
        "stage": "daily",
        "generated_at_utc": "t",
        "teams": [],
    }
    report.publish(doc, session=Session())
    assert sent["url"].endswith("/rest/v1/nfl_dst_rankings?on_conflict=season,week,scoring_preset")
    assert sent["json"]["doc"] is doc and sent["headers"]["Prefer"].startswith(
        "resolution=merge-duplicates"
    )
