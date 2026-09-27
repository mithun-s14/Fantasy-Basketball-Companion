import json
from datetime import UTC, datetime
from pathlib import Path

from streamer.ingest.espn import parse_odds

FIXTURE = json.loads((Path(__file__).parent / "fixtures/espn_scoreboard.json").read_text())
NOW = datetime(2026, 9, 26, 12, tzinfo=UTC)


def test_parses_lines_and_skips_games_without_odds():
    df = parse_odds(FIXTURE, 2026, 4, NOW)
    # ATL@GB is final with no odds, so 3 of 4 games remain.
    assert df.select("home_team", "away_team", "home_spread", "total").rows() == [
        ("CLE", "PIT", 3.0, 38.5),
        ("WAS", "IND", 4.5, 46.5),  # ESPN "WSH" normalized
        ("BUF", "NE", -5.5, 49.5),
    ]
    assert df.select("home_moneyline", "away_moneyline").row(0) == (124, -148)
    assert df["provider"].unique().to_list() == ["DraftKings"]
    assert df["fetched_at_utc"].unique().to_list() == [NOW]
    assert (df["season"] == 2026).all() and (df["week"] == 4).all()


def test_missing_or_off_moneyline_is_null():
    board = {
        "events": [
            {
                "id": "1",
                "competitions": [
                    {
                        "competitors": [
                            {"homeAway": "home", "team": {"abbreviation": "KC"}},
                            {"homeAway": "away", "team": {"abbreviation": "LAR"}},
                        ],
                        "odds": [
                            {
                                "spread": -3.0,
                                "overUnder": 44.0,
                                "moneyline": {"home": {"close": {"odds": "OFF"}}},
                            }
                        ],
                    }
                ],
            }
        ]
    }
    row = parse_odds(board, 2026, 4, NOW).row(0, named=True)
    assert (row["away_team"], row["home_moneyline"], row["away_moneyline"]) == ("LA", None, None)
