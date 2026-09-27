"""Expected starting QB per offense and that QB's rates (FR1.4, FR2 "Opposing QB")."""

import polars as pl

from streamer.stats.games import snap_plays
from streamer.teams import canon

# A listed starter with one of these statuses is not expected to play.
OUT_STATUSES = {"Out", "Doubtful", "IR", "PUP", "Sus"}
LOW_SAMPLE_DROPBACKS = 50


def expected_starters(
    sleeper_players: pl.DataFrame,
    injuries: pl.DataFrame,
    season: int,
    week: int,
    overrides: dict[str, str] | None = None,
) -> pl.DataFrame:
    """One row per team: the QB expected to start, by Sleeper depth order.

    Status comes from that week's official injury report when the QB is on it, else from
    Sleeper. If the depth-chart starter is Out/Doubtful/etc., the next healthy QB is the
    expected starter and qb_changed is true. `overrides` (team -> QB full name, from
    config/overrides.yaml) wins over all of that.
    """
    overrides = {canon(t): name for t, name in (overrides or {}).items()}
    report = injuries.filter(
        (pl.col("season") == season) & (pl.col("week") == week) & (pl.col("position") == "QB")
    ).select("gsis_id", "report_status")
    qbs = (
        sleeper_players.filter(
            (pl.col("position") == "QB") & pl.col("depth_chart_order").is_not_null()
        )
        .join(report, on="gsis_id", how="left")
        .with_columns(status=pl.coalesce("report_status", "injury_status"))
        .sort("team", "depth_chart_order")
    )
    rows = []
    for (team,), depth in qbs.group_by("team", maintain_order=True):
        listed = depth.row(0, named=True)
        healthy = depth.filter(~pl.col("status").is_in(OUT_STATUSES) | pl.col("status").is_null())
        starter = healthy.row(0, named=True) if healthy.height else listed
        if team in overrides:
            match = depth.filter(pl.col("full_name").str.to_lowercase() == overrides[team].lower())
            if match.is_empty():
                raise ValueError(f"Override QB {overrides[team]!r} is not a {team} QB in Sleeper")
            starter = match.row(0, named=True)
        rows.append(
            {
                "team": team,
                "qb_id": starter["gsis_id"],
                "qb_name": starter["full_name"],
                "qb_status": starter["status"] or "Active",
                "qb_changed": starter["gsis_id"] != listed["gsis_id"],
                "listed_starter": listed["full_name"],
            }
        )
    return pl.DataFrame(rows)


def qb_rates(plays: pl.DataFrame) -> pl.DataFrame:
    """Per QB (gsis id): dropbacks, attempts, sacks, INTs, fumbles and the three rates.

    Dropbacks credit the passer on sacks and scrambles too (nflverse `passer_id`).
    Designed runs are non-dropback rushes; fumbles count whether or not they were lost.
    """
    snaps = snap_plays(plays)
    passing = (
        snaps.filter(pl.col("qb_dropback") == 1)
        .group_by(qb_id=pl.col("passer_id").cast(pl.String))
        .agg(
            dropbacks=pl.len(),
            attempts=(
                pl.col("complete_pass") + pl.col("incomplete_pass") + pl.col("interception")
            ).sum(),
            sacks=pl.col("sack").sum(),
            interceptions=pl.col("interception").sum(),
        )
    )
    rushes = (
        snaps.filter((pl.col("qb_dropback") == 0) & (pl.col("rush_attempt") == 1))
        .group_by(qb_id=pl.col("rusher_id").cast(pl.String))
        .agg(rushes=pl.len())
    )
    fumbles = (
        snaps.filter(pl.col("fumble") == 1)
        .group_by(qb_id=pl.col("fumbled_1_player_id").cast(pl.String))
        .agg(fumbles=pl.len())
    )
    return (
        passing.join(rushes, on="qb_id", how="left")
        .join(fumbles, on="qb_id", how="left")
        .with_columns(pl.col("rushes", "fumbles").fill_null(0))
        .with_columns(
            sack_rate=pl.col("sacks") / pl.col("dropbacks"),
            int_rate=pl.col("interceptions") / pl.col("attempts"),
            fumble_rate=pl.col("fumbles") / (pl.col("dropbacks") + pl.col("rushes")),
        )
        .filter(pl.col("qb_id").is_not_null())
    )


def career_starts(schedules_all: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Regular-season starts per QB in games played before the target week."""
    played = schedules_all.filter(
        (pl.col("game_type") == "REG")
        & pl.col("result").is_not_null()
        & ((pl.col("season") < season) | ((pl.col("season") == season) & (pl.col("week") < week)))
    )
    ids = pl.concat([played.select(qb_id="home_qb_id"), played.select(qb_id="away_qb_id")])
    return ids.drop_nulls().group_by("qb_id").agg(career_starts=pl.len())


def opposing_qb(
    starters: pl.DataFrame,
    rates_now: pl.DataFrame,
    rates_last: pl.DataFrame,
    starts: pl.DataFrame,
) -> pl.DataFrame:
    """Per offense team: its expected QB with this season's rates, career starts, and last
    season's rates when this season's sample is under 50 dropbacks."""
    rate_cols = ["dropbacks", "sack_rate", "int_rate", "fumble_rate"]
    last = rates_last.select("qb_id", *[pl.col(c).alias(f"last_{c}") for c in rate_cols[:3]])
    return (
        starters.join(rates_now.select("qb_id", *rate_cols), on="qb_id", how="left")
        .join(starts, on="qb_id", how="left")
        .join(last, on="qb_id", how="left")
        .with_columns(
            pl.col("dropbacks", "career_starts").fill_null(0),
            low_sample=pl.col("dropbacks").fill_null(0) < LOW_SAMPLE_DROPBACKS,
        )
        .with_columns(
            # Last season's rates are shown only for low-sample QBs.
            [
                pl.when(pl.col("low_sample")).then(pl.col(f"last_{c}")).alias(f"last_{c}")
                for c in rate_cols[:3]
            ]
        )
    )
