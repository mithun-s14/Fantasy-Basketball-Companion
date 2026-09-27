from datetime import UTC, datetime

import polars as pl
import pytest

from streamer import refresh as refresh_mod
from streamer import supabase
from streamer.http import TRIES
from streamer.ingest.espn import SCHEMA

NOW = datetime(2026, 9, 29, 11, 7, tzinfo=UTC)


class Response:
    def __init__(self, status, text=""):
        self.status_code, self.text = status, text


class Session:
    def __init__(self, *statuses):
        self.statuses, self.calls = list(statuses), []

    def post(self, url, json, headers, timeout):
        self.calls.append((url, json))
        return Response(self.statuses.pop(0), '{"message":"Invalid API key"}')


@pytest.fixture(autouse=True)
def creds(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    monkeypatch.setattr("streamer.http.time.sleep", lambda _: None)


def test_bad_key_fails_loudly_without_retrying():
    session = Session(401)
    with pytest.raises(RuntimeError, match="Supabase upsert t failed after 1 tries: HTTP 401"):
        supabase.upsert("t", [], "id", session=session)
    assert len(session.calls) == 1


def test_server_errors_retry_then_succeed():
    session = Session(503, 502, 201)
    supabase.upsert("t", [{"a": 1}], "id", session=session)
    assert len(session.calls) == 3
    with pytest.raises(RuntimeError, match=f"after {TRIES} tries"):
        supabase.upsert("t", [], "id", session=Session(*[500] * TRIES))


def odds():
    return pl.DataFrame(
        [
            {
                "fetched_at_utc": NOW,
                "season": 2026,
                "week": 4,
                "espn_game_id": "1",
                "home_team": "BUF",
                "away_team": "NE",
                "provider": "DraftKings",
                "home_spread": -5.5,
                "total": 49.5,
                "home_moneyline": -250,
                "away_moneyline": 205,
            }
        ],
        schema=SCHEMA,
    )


def doc(preset):
    team = {
        "team": "BUF",
        "opponent": "NE",
        "is_home": True,
        "lines": {"opp_implied_total": 22.0},
        "flags": ["LOW_IMPLIED"],
    }
    no_lines = team | {"team": "NE", "is_home": False, "lines": {"opp_implied_total": None}}
    return {
        "season": 2026,
        "week": 4,
        "stage": "early",
        "generated_at_utc": "2026-09-29T11:07:00Z",
        "scoring_preset": preset,
        "teams": [team, no_lines],
    }


def test_refresh_runs_ingest_archive_build_and_writes_summary(tmp_path, monkeypatch):
    upserts, builds = [], []
    monkeypatch.setattr(refresh_mod, "ingest", lambda s, w, now: (2026, 4, odds()))
    monkeypatch.setattr(
        refresh_mod.supabase, "upsert", lambda table, rows, on: upserts.append((table, rows, on))
    )

    def fake_build(season, week, presets, stage, publish, now):
        builds.append((season, week, presets, stage, publish))
        return [doc("espn_default"), doc("yahoo_default")]

    monkeypatch.setattr(refresh_mod, "build", fake_build)
    summary_file = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary_file))

    refresh_mod.refresh("early", now=NOW)

    [(table, rows, on)] = upserts
    assert (table, on) == ("nfl_odds_snapshots", "fetched_at_utc,espn_game_id,provider")
    assert rows[0]["fetched_at_utc"] == "2026-09-29T11:07:00Z" and rows[0]["home_spread"] == -5.5
    assert builds == [(2026, 4, None, "early", True)]  # every preset, published
    text = summary_file.read_text()
    assert "### D/ST refresh: 2026 week 4 (early)" in text
    assert "`yahoo_default`: 2 D/STs published" in text
    assert "| BUF | vs NE | 22.0 | LOW_IMPLIED |" in text
    assert "| NE |" not in text  # rows without lines are left out of the top 5


def test_refresh_rejects_unknown_stage():
    with pytest.raises(ValueError, match="stage must be one of"):
        refresh_mod.refresh("weekly")
