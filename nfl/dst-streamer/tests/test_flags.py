from datetime import UTC, datetime

import polars as pl
import pytest

from streamer.flags import apply_flags, legend, load_flags

NOW = datetime(2026, 10, 1, 12, tzinfo=UTC)
CFG = load_flags()

# A row where no flag fires; each test changes only what its flag looks at.
BASE = {
    "team": "X",
    "opp_qb_id": "Q1",
    "opp_week1_qb_id": "Q1",
    "opp_qb_career_starts": 50,
    "opp_implied_total": 30.0,
    "spread": 3.0,
    "opp_qb_sack_rate": 0.01,
    "opp_giveaways_per_game": 0.1,
    "opp_ol_out": 0,
    "roof": "outdoors",
    "wind_mph": 5,
    "def_games": 4,
    "opp_games": 4,
    "lines_timestamp_utc": datetime(2026, 10, 1, 6, tzinfo=UTC),
}


def flags_for(rows: list[dict]) -> list[list[str]]:
    df = pl.DataFrame(
        [BASE | {"team": f"T{i}"} | r for i, r in enumerate(rows)],
        schema_overrides={"lines_timestamp_utc": pl.Datetime("us", "UTC"), "opp_qb_id": pl.String},
    )
    return apply_flags(df, CFG, NOW)["flags"].to_list()


RANK_FLAGS = {"LOW_IMPLIED", "SACK_PRONE_QB", "TURNOVER_PRONE"}


def test_no_row_flags_on_a_plain_row():
    # A lone row is trivially the best of its week, so only the rank-based flags fire.
    assert set(flags_for([{}])[0]) == RANK_FLAGS


@pytest.mark.parametrize(
    ("flag", "hit", "miss"),
    [
        ("BACKUP_QB", {"opp_qb_id": "Q2"}, {}),
        ("ROOKIE_QB", {"opp_qb_career_starts": 7}, {"opp_qb_career_starts": 8}),
        ("BIG_FAVORITE", {"spread": -7.0}, {"spread": -6.5}),
        ("OL_INJURY", {"opp_ol_out": 2}, {"opp_ol_out": 1}),
        ("WIND", {"wind_mph": 15}, {"wind_mph": 15, "roof": "dome"}),
        ("LOW_SAMPLE", {"opp_games": 2}, {"def_games": 3, "opp_games": 3}),
        ("STALE_LINES", {"lines_timestamp_utc": datetime(2026, 9, 30, 11, tzinfo=UTC)}, {}),
    ],
)
def test_row_rules(flag, hit, miss):
    hit_flags, miss_flags = flags_for([hit, miss])
    assert flag in hit_flags and flag not in miss_flags


@pytest.mark.parametrize(
    ("flag", "col", "best_is_high", "n"),
    [
        ("LOW_IMPLIED", "opp_implied_total", False, 5),
        ("SACK_PRONE_QB", "opp_qb_sack_rate", True, 8),
        ("TURNOVER_PRONE", "opp_giveaways_per_game", True, 8),
    ],
)
def test_week_rank_rules(flag, col, best_is_high, n):
    # 12 rows with distinct values; only the best n get the flag.
    values = [float(i) for i in range(12)]
    got = flags_for([{col: v} for v in values])
    best = sorted(values, reverse=best_is_high)[:n]
    assert [flag in f for f in got] == [v in best for v in values]


def test_missing_data_never_flags():
    row = {"opp_qb_id": None, "spread": None, "wind_mph": None, "lines_timestamp_utc": None}
    assert set(flags_for([row])[0]) == RANK_FLAGS


def test_legend_fills_thresholds():
    entries = legend(CFG)
    assert [e["flag"] for e in entries] == list(CFG)  # config order kept
    assert {"flag": "ROOKIE_QB", "rule": "Opponent QB has fewer than 8 career starts"} in entries
