"""Rule-based flags (FR3), thresholds from config/flags.yaml."""

from datetime import datetime
from pathlib import Path

import polars as pl
import yaml

FLAGS_FILE = Path(__file__).resolve().parents[2] / "config" / "flags.yaml"
OUTDOOR = ["outdoors", "open"]


def load_flags(path: Path = FLAGS_FILE) -> dict:
    return yaml.safe_load(path.read_text())


def legend(cfg: dict) -> list[dict[str, str]]:
    """Ordered like the config. A list, since Postgres jsonb reorders object keys."""
    return [
        {"flag": name, "rule": rule["description"].format(**rule)} for name, rule in cfg.items()
    ]


def _rules(cfg: dict, now: datetime) -> dict[str, pl.Expr]:
    c = cfg
    week_rank = lambda col, desc: pl.col(col).rank("min", descending=desc)  # noqa: E731
    return {
        "BACKUP_QB": pl.col("opp_qb_id") != pl.col("opp_week1_qb_id"),
        "ROOKIE_QB": pl.col("opp_qb_career_starts") < c["ROOKIE_QB"]["min_career_starts"],
        "LOW_IMPLIED": week_rank("opp_implied_total", False) <= c["LOW_IMPLIED"]["bottom_n"],
        "BIG_FAVORITE": pl.col("spread") <= -c["BIG_FAVORITE"]["min_favored_by"],
        "SACK_PRONE_QB": week_rank("opp_qb_sack_rate", True) <= c["SACK_PRONE_QB"]["top_n"],
        "TURNOVER_PRONE": week_rank("opp_giveaways_per_game", True) <= c["TURNOVER_PRONE"]["top_n"],
        "OL_INJURY": pl.col("opp_ol_out") >= c["OL_INJURY"]["min_linemen"],
        "WIND": pl.col("roof").is_in(OUTDOOR) & (pl.col("wind_mph") >= c["WIND"]["min_mph"]),
        "LOW_SAMPLE": pl.min_horizontal(
            pl.col("def_games").fill_null(0), pl.col("opp_games").fill_null(0)
        )
        < c["LOW_SAMPLE"]["min_games"],
        "STALE_LINES": (pl.lit(now) - pl.col("lines_timestamp_utc")).dt.total_hours()
        > c["STALE_LINES"]["max_age_hours"],
    }


def apply_flags(table: pl.DataFrame, cfg: dict, now: datetime) -> pl.DataFrame:
    """Add `flags`: list of flag names whose rule is true. Missing data never raises a flag."""
    rules = _rules(cfg, now)
    hits = [pl.when(rules[name].fill_null(False)).then(pl.lit(name)) for name in cfg]
    return table.with_columns(flags=pl.concat_list(hits).list.drop_nulls())
