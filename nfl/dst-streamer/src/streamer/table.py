"""Assemble one row per D/ST for a week (FR2 columns + ranks + flags)."""

import glob
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import polars as pl
import yaml

from streamer.flags import apply_flags
from streamer.ingest.run import CACHE, LAST_WEEK, SNAPSHOTS
from streamer.stats import defense, fantasy_points, games, lines, matchups, offense, qb
from streamer.stats.ranks import add_ranks

OVERRIDES_FILE = Path(__file__).resolve().parents[2] / "config" / "overrides.yaml"
OL_POSITIONS = ["C", "G", "T"]


@dataclass
class Inputs:
    schedules: pl.DataFrame
    schedules_all: pl.DataFrame
    pbp: pl.DataFrame
    pbp_prev: pl.DataFrame
    injuries: pl.DataFrame
    sleeper_players: pl.DataFrame
    odds: pl.DataFrame


def load_inputs(season: int, cache: Path = CACHE, snapshots: Path = SNAPSHOTS) -> Inputs:
    read = lambda name: pl.read_parquet(cache / f"{name}.parquet")  # noqa: E731
    odds_files = sorted(glob.glob(str(snapshots / str(season) / "*.parquet")))
    if not odds_files:
        raise RuntimeError(f"No odds snapshots for {season}; run `streamer ingest` first")
    return Inputs(
        schedules=read(f"schedules_{season}"),
        schedules_all=read("schedules_all"),
        pbp=read(f"pbp_{season}"),
        pbp_prev=read(f"pbp_{season - 1}"),
        injuries=read(f"injuries_{season}"),
        sleeper_players=read("sleeper_players"),
        odds=pl.concat([pl.read_parquet(f) for f in odds_files], how="diagonal_relaxed"),
    )


def load_overrides(path: Path = OVERRIDES_FILE) -> dict[str, str]:
    return yaml.safe_load(path.read_text()) or {}


def _prefix(df: pl.DataFrame, prefix: str, key: str = "team") -> pl.DataFrame:
    return df.rename({c: f"{prefix}{c}" for c in df.columns if c != key})


def build_table(
    inp: Inputs,
    season: int,
    week: int,
    preset: dict,
    flags_cfg: dict,
    now: datetime,
    overrides: dict[str, str] | None = None,
) -> pl.DataFrame:
    """One row per team playing `week`, season-to-date stats through week - 1."""
    plays = games.before(games.reg_plays(inp.pbp), season, week)
    played = inp.schedules.filter(pl.col("week") < week)
    scored = fantasy_points.score(fantasy_points.components(plays, played), preset)

    starters = qb.expected_starters(inp.sleeper_players, inp.injuries, season, week, overrides)
    opp_qb = qb.opposing_qb(
        starters,
        qb.qb_rates(plays),
        qb.qb_rates(games.reg_plays(inp.pbp_prev)),
        qb.career_starts(inp.schedules_all, season, week),
    ).select(
        "team",
        qb_id="qb_id",
        qb_name="qb_name",
        qb_status="qb_status",
        qb_changed="qb_changed",
        qb_career_starts="career_starts",
        qb_dropbacks="dropbacks",
        qb_sack_rate="sack_rate",
        qb_int_rate="int_rate",
        qb_fumble_rate="fumble_rate",
        qb_low_sample="low_sample",
        qb_last_dropbacks="last_dropbacks",
        qb_last_sack_rate="last_sack_rate",
        qb_last_int_rate="last_int_rate",
    )
    # BACKUP_QB compares against each team's Week 1 starter.
    wk1 = inp.schedules.filter(pl.col("week") == 1)
    week1_qb = pl.concat(
        [
            wk1.select(team="home_team", week1_qb_id="home_qb_id"),
            wk1.select(team="away_team", week1_qb_id="away_qb_id"),
        ]
    )
    ol_out = (
        inp.injuries.filter(
            (pl.col("season") == season)
            & (pl.col("week") == week)
            & pl.col("position").is_in(OL_POSITIONS)
            & pl.col("report_status").is_in(["Out", "Doubtful"])
        )
        .group_by("team")
        .agg(ol_out=pl.len())
    )

    opponent_side = (
        opp_qb.join(offense.offense_stats(plays, scored), on="team", how="full", coalesce=True)
        .join(week1_qb, on="team", how="left")
        .join(ol_out, on="team", how="left")
        .with_columns(pl.col("ol_out").fill_null(0))
    )
    nxt = week + 1
    next_week = (
        matchups.week_matchups(inp.schedules, season, nxt).select(
            "team", next_opponent="opponent", next_is_home="is_home"
        )
        if nxt <= LAST_WEEK
        else pl.DataFrame(
            schema={"team": pl.String, "next_opponent": pl.String, "next_is_home": pl.Boolean}
        )
    )
    next_lines = lines.team_lines(inp.odds, season, nxt).select(
        "team", next_opp_implied_total="opp_implied_total"
    )

    table = (
        matchups.week_matchups(inp.schedules, season, week)
        .join(lines.team_lines(inp.odds, season, week).drop("opponent"), on="team", how="left")
        .join(
            _prefix(opponent_side, "opp_").rename({"team": "opponent"}), on="opponent", how="left"
        )
        .join(
            _prefix(defense.defense_stats(plays, scored), "def_").rename(
                {"def_dst_fpts_per_game": "dst_fpts_per_game", "def_return_tds": "dst_return_tds"}
            ),
            on="team",
            how="left",
        )
        .join(next_week, on="team", how="left")
        .join(next_lines, on="team", how="left")
    )
    table = add_ranks(table)
    table = apply_flags(table, flags_cfg, now)
    return table.sort("opp_implied_total", nulls_last=True)
