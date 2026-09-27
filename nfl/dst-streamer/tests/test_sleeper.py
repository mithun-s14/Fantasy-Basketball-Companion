import json
from pathlib import Path

import polars as pl

from streamer.ingest.sleeper import fill_gsis_ids, parse_players

FIXTURE = json.loads((Path(__file__).parent / "fixtures/sleeper_players.json").read_text())


def test_keeps_rostered_qbs_and_dsts_only():
    df = parse_players(FIXTURE).sort("player_id")
    # The WR and the free-agent QB are dropped.
    assert df.select("player_id", "team", "position").rows() == [
        ("3294", "DAL", "QB"),
        ("4574", "ATL", "QB"),
        ("8162", "DAL", "QB"),
        ("LAR", "LA", "DEF"),
        ("WAS", "WAS", "DEF"),
    ]


def test_qb_fields():
    df = parse_players(FIXTURE)
    dak = df.filter(df["player_id"] == "3294").row(0, named=True)
    assert (dak["full_name"], dak["depth_chart_order"], dak["gsis_id"]) == (
        "Dak Prescott",
        1,
        "00-0033077",
    )
    rush = df.filter(df["player_id"] == "4574").row(0, named=True)
    assert (rush["depth_chart_order"], rush["injury_status"]) == (2, "Out")
    rams = df.filter(df["player_id"] == "LAR").row(0, named=True)
    assert rams["full_name"] == "Los Angeles Rams"


def test_fill_gsis_ids_only_fills_missing():
    players = parse_players(FIXTURE)
    id_map = pl.DataFrame(
        {"sleeper_id": [3294, 4574, 999], "gsis_id": ["WRONG", "00-FILLED", "00-OTHER"]}
    )
    filled = dict(fill_gsis_ids(players, id_map).select("player_id", "gsis_id").iter_rows())
    assert filled["3294"] == "00-0033077"  # Sleeper's own id wins
    assert filled["4574"] == (FIXTURE["4574"]["gsis_id"] or "00-FILLED")
    assert filled["LAR"] is None
