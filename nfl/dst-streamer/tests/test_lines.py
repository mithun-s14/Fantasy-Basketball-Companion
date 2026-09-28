from datetime import UTC, datetime

import polars as pl
import pytest

from streamer.stats.lines import team_lines

T0, T1 = datetime(2026, 9, 29, tzinfo=UTC), datetime(2026, 10, 1, tzinfo=UTC)


def snap(t, spread, total, home_ml, away_ml, provider="DraftKings"):
    return {
        "fetched_at_utc": t,
        "season": 2026,
        "week": 4,
        "espn_game_id": "1",
        "home_team": "BUF",
        "away_team": "NE",
        "provider": provider,
        "home_spread": spread,
        "total": total,
        "home_moneyline": home_ml,
        "away_moneyline": away_ml,
    }


SNAPS = pl.DataFrame(
    [
        snap(T0, -5.5, 49.5, -250, 205),
        # Latest snapshot: two books, median taken.
        snap(T1, -6.0, 47.0, -260, 210),
        snap(T1, -7.0, 48.0, -280, 230, provider="Other"),
    ]
)


def test_implied_totals_spread_and_move():
    rows = {r["team"]: r for r in team_lines(SNAPS, 2026, 4).iter_rows(named=True)}
    buf, ne = rows["BUF"], rows["NE"]
    # Consensus: spread -6.5, total 47.5. NE implied = (47.5 - 6.5) / 2 = 20.5.
    assert (buf["spread"], buf["total"], buf["opp_implied_total"]) == (-6.5, 47.5, 20.5)
    # BUF implied = (47.5 + 6.5) / 2 = 27.0.
    assert (ne["spread"], ne["opp_implied_total"]) == (6.5, 27.0)
    # First snapshot: NE implied (49.5 - 5.5) / 2 = 22.0 -> moved -1.5.
    assert buf["implied_total_move"] == pytest.approx(-1.5)
    assert buf["lines_timestamp_utc"] == T1


def test_win_prob_is_devigged():
    rows = {r["team"]: r for r in team_lines(SNAPS, 2026, 4).iter_rows(named=True)}
    # Median MLs -270 / +220: raw 0.7297 and 0.3125, normalized to sum to 1.
    assert rows["BUF"]["d_win_prob"] == pytest.approx(0.7297 / (0.7297 + 0.3125), abs=1e-3)
    assert rows["BUF"]["d_win_prob"] + rows["NE"]["d_win_prob"] == pytest.approx(1)
