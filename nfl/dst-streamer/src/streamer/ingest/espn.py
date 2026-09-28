"""Betting lines from ESPN's public scoreboard (unofficial, no key).

ESPN shows one bookmaker per game (DraftKings as of 2026-09-26). `odds[0].spread`
is the home team's spread; moneylines are American odds strings under
`odds[0].moneyline.{home,away}.close.odds`.
"""

from datetime import datetime

import polars as pl

from streamer.http import get_json
from streamer.teams import canon

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"

SCHEMA = {
    "fetched_at_utc": pl.Datetime("us", "UTC"),
    "season": pl.Int32,
    "week": pl.Int32,
    "espn_game_id": pl.String,
    "home_team": pl.String,
    "away_team": pl.String,
    "provider": pl.String,
    "home_spread": pl.Float64,
    "total": pl.Float64,
    "home_moneyline": pl.Int32,
    "away_moneyline": pl.Int32,
}


def fetch_scoreboard(season: int, week: int) -> dict:
    # Regular season only (seasontype=2); dates pins the season explicitly.
    return get_json(f"{SCOREBOARD}?seasontype=2&week={week}&dates={season}")


def _american(odds: str | None) -> int | None:
    if not odds:
        return None
    if odds.upper() == "EVEN":
        return 100
    try:
        return int(odds.replace("+", ""))
    except ValueError:  # "OFF" and similar
        return None


def parse_odds(scoreboard: dict, season: int, week: int, fetched_at: datetime) -> pl.DataFrame:
    """One row per game that has lines posted. Games without odds are skipped."""
    rows = []
    for event in scoreboard["events"]:
        comp = event["competitions"][0]
        if not comp.get("odds"):
            continue
        odds = comp["odds"][0]
        teams = {c["homeAway"]: canon(c["team"]["abbreviation"]) for c in comp["competitors"]}
        ml = odds.get("moneyline") or {}
        rows.append(
            {
                "fetched_at_utc": fetched_at,
                "season": season,
                "week": week,
                "espn_game_id": event["id"],
                "home_team": teams["home"],
                "away_team": teams["away"],
                "provider": odds.get("provider", {}).get("name"),
                "home_spread": odds.get("spread"),
                "total": odds.get("overUnder"),
                "home_moneyline": _american(ml.get("home", {}).get("close", {}).get("odds")),
                "away_moneyline": _american(ml.get("away", {}).get("close", {}).get("odds")),
            }
        )
    return pl.DataFrame(rows, schema=SCHEMA)
