"""Consensus lines, implied totals, win probability and line movement from odds snapshots."""

import polars as pl

GAME = ["season", "week", "home_team", "away_team"]


def _implied_prob(ml: pl.Expr) -> pl.Expr:
    # American odds to raw implied probability (still includes the bookmaker's vig).
    return pl.when(ml > 0).then(100 / (ml + 100)).otherwise(-ml / (-ml + 100))


def consensus(snapshots: pl.DataFrame) -> pl.DataFrame:
    """Median line across bookmakers for each game in each snapshot."""
    return snapshots.group_by(*GAME, "fetched_at_utc").agg(
        pl.col("home_spread", "total", "home_moneyline", "away_moneyline").median()
    )


def team_lines(snapshots: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """One row per team with lines for that week, from the D/ST team's point of view.

    spread: the team's spread (negative = favored). opp_implied_total = (total + spread) / 2,
    i.e. (total - opp_spread) / 2. implied_total_move: latest minus first snapshot of the week.
    """
    games = consensus(snapshots.filter((pl.col("season") == season) & (pl.col("week") == week)))
    first = games.sort("fetched_at_utc").group_by(GAME).first()
    latest = games.sort("fetched_at_utc").group_by(GAME).last()
    latest = latest.join(
        first.select(*GAME, first_spread="home_spread", first_total="total"), on=GAME
    )

    home_p, away_p = (
        _implied_prob(pl.col("home_moneyline")),
        _implied_prob(pl.col("away_moneyline")),
    )
    sides = []
    for team, opp, sign, p_team, p_opp in [
        ("home_team", "away_team", 1, home_p, away_p),
        ("away_team", "home_team", -1, away_p, home_p),
    ]:
        spread = sign * pl.col("home_spread")
        first_spread = sign * pl.col("first_spread")
        opp_implied = (pl.col("total") + spread) / 2
        sides.append(
            latest.select(
                team=pl.col(team),
                opponent=pl.col(opp),
                spread=spread,
                total="total",
                opp_implied_total=opp_implied,
                d_win_prob=p_team / (p_team + p_opp),  # de-vigged
                implied_total_move=opp_implied - (pl.col("first_total") + first_spread) / 2,
                lines_timestamp_utc="fetched_at_utc",
            )
        )
    return pl.concat(sides)
