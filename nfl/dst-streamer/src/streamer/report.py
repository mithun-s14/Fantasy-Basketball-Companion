"""Outputs (FR7): the PRD's JSON document, a Markdown summary, and a Supabase upsert.

Local files: data/rankings/{season}/week_{nn}.{preset}.{json,md}. With --publish the JSON
document is upserted into Supabase `nfl_dst_rankings` (one row per season/week/preset),
which the app's /nfl/dst page reads.
"""

import json
import os
from datetime import datetime
from pathlib import Path

import polars as pl
import requests

from streamer.flags import legend

SCHEMA_VERSION = 1
RANKINGS = Path("data/rankings")
ENV_FILE = Path(__file__).resolve().parents[4] / ".env.local"

GROUPS = {
    "lines": {
        "opp_implied_total": "opp_implied_total",
        "spread": "spread",
        "total": "total",
        "d_win_prob": "d_win_prob",
        "implied_total_move": "implied_total_move",
        "timestamp_utc": "lines_timestamp_utc",
    },
    "opp_qb": {
        "name": "opp_qb_name",
        "status": "opp_qb_status",
        "changed": "opp_qb_changed",
        "career_starts": "opp_qb_career_starts",
        "dropbacks": "opp_qb_dropbacks",
        "sack_rate": "opp_qb_sack_rate",
        "sack_rate_rank": "opp_qb_sack_rate_rank",
        "int_rate": "opp_qb_int_rate",
        "int_rate_rank": "opp_qb_int_rate_rank",
        "fumble_rate": "opp_qb_fumble_rate",
        "fumble_rate_rank": "opp_qb_fumble_rate_rank",
        "low_sample": "opp_qb_low_sample",
    },
    "opp_offense": {
        "sack_rate_allowed": "opp_sack_rate_allowed",
        "sack_rate_allowed_rank": "opp_sack_rate_allowed_rank",
        "giveaways_per_game": "opp_giveaways_per_game",
        "giveaways_per_game_rank": "opp_giveaways_per_game_rank",
        "points_per_game": "opp_points_per_game",
        "points_per_game_rank": "opp_points_per_game_rank",
        "yards_per_play": "opp_yards_per_play",
        "yards_per_play_rank": "opp_yards_per_play_rank",
        "fpa_to_dst": "opp_fpa_to_dst",
        "fpa_to_dst_rank": "opp_fpa_to_dst_rank",
        "games": "opp_games",
    },
    "defense": {
        "sacks_per_game": "def_sacks_per_game",
        "sacks_per_game_rank": "def_sacks_per_game_rank",
        "sack_rate": "def_sack_rate",
        "sack_rate_rank": "def_sack_rate_rank",
        "takeaways_per_game": "def_takeaways_per_game",
        "takeaways_per_game_rank": "def_takeaways_per_game_rank",
        "points_allowed_per_game": "def_points_allowed_per_game",
        "points_allowed_per_game_rank": "def_points_allowed_per_game_rank",
        "yards_per_play_allowed": "def_yards_per_play_allowed",
        "yards_per_play_allowed_rank": "def_yards_per_play_allowed_rank",
        "dst_fpts_per_game": "dst_fpts_per_game",
        "dst_fpts_per_game_rank": "dst_fpts_per_game_rank",
        "return_tds": "dst_return_tds",
        "games": "def_games",
    },
    "context": {
        "rest_days": "rest_days",
        "is_divisional": "is_divisional",
        "roof": "roof",
        "wind_mph": "wind_mph",
        "temp_f": "temp_f",
    },
    "next_week": {
        "opponent": "next_opponent",
        "is_home": "next_is_home",
        "opp_implied_total": "next_opp_implied_total",
    },
}


def _json_value(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, float):
        return round(v, 4)
    return v


def to_doc(table: pl.DataFrame, meta: dict, flags_cfg: dict) -> dict:
    """The PRD section 11 data contract, plus the flag legend for the page."""
    teams = []
    for r in table.iter_rows(named=True):
        row = {k: _json_value(r[k]) for k in ("team", "opponent", "is_home", "kickoff_utc")}
        for group, cols in GROUPS.items():
            row[group] = {k: _json_value(r[c]) for k, c in cols.items()}
        if r["opp_qb_low_sample"]:
            row["opp_qb"]["last_season"] = {
                "dropbacks": r["opp_qb_last_dropbacks"],
                "sack_rate": _json_value(r["opp_qb_last_sack_rate"]),
                "int_rate": _json_value(r["opp_qb_last_int_rate"]),
            }
        row["flags"] = r["flags"]
        row["available"] = r["available"]
        teams.append(row)
    return {
        "schema_version": SCHEMA_VERSION,
        **meta,
        "sort": "opp_implied_total_asc",
        "flag_legend": legend(flags_cfg),
        "teams": teams,
    }


def _pct(v):
    return "" if v is None else f"{v:.1%}"


def to_markdown(doc: dict) -> str:
    head = (
        f"# D/ST streamer: {doc['season']} week {doc['week']} ({doc['scoring_preset']})\n\n"
        f"Generated {doc['generated_at_utc']}. Sorted by opponent implied total, lowest first.\n\n"
        "| Team | Opp | Implied | Spread | Opp QB | QB sack% | QB INT% | Flags |\n"
        "|---|---|---|---|---|---|---|---|\n"
    )
    rows = []
    for t in doc["teams"]:
        lines, q = t["lines"], t["opp_qb"]
        opp = ("vs " if t["is_home"] else "@ ") + t["opponent"]
        implied = "" if lines["opp_implied_total"] is None else f"{lines['opp_implied_total']:.1f}"
        spread = "" if lines["spread"] is None else f"{lines['spread']:+g}"
        rows.append(
            f"| {t['team']} | {opp} | {implied} | {spread} | {q['name'] or ''} | "
            f"{_pct(q['sack_rate'])} | {_pct(q['int_rate'])} | {', '.join(t['flags'])} |"
        )
    legend_md = "\n".join(f"- `{e['flag']}`: {e['rule']}" for e in doc["flag_legend"])
    footer = (
        "\n\nData: nflverse (play-by-play, schedules, injuries), ESPN (lines), "
        "Sleeper (depth charts)."
    )
    return head + "\n".join(rows) + "\n\n## Flags\n\n" + legend_md + footer + "\n"


def write_outputs(doc: dict, root: Path = RANKINGS) -> list[Path]:
    folder = root / str(doc["season"])
    folder.mkdir(parents=True, exist_ok=True)
    stem = f"week_{doc['week']:02d}.{doc['scoring_preset']}"
    json_path, md_path = folder / f"{stem}.json", folder / f"{stem}.md"
    json_path.write_text(json.dumps(doc, indent=1))
    md_path.write_text(to_markdown(doc))
    return [json_path, md_path]


def _supabase_env() -> tuple[str, str]:
    """Env vars first, then the app's .env.local (same keys the Next.js app uses)."""
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                env.setdefault(key.strip(), value.strip().strip('"'))
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to publish")
    return url, key


def publish(doc: dict, session=requests) -> None:
    url, key = _supabase_env()
    row = {
        "season": doc["season"],
        "week": doc["week"],
        "scoring_preset": doc["scoring_preset"],
        "schema_version": doc["schema_version"],
        "stage": doc["stage"],
        "generated_at": doc["generated_at_utc"],
        "doc": doc,
    }
    res = session.post(
        f"{url}/rest/v1/nfl_dst_rankings?on_conflict=season,week,scoring_preset",
        json=row,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        timeout=30,
    )
    if res.status_code >= 300:
        raise RuntimeError(f"Supabase upsert failed: HTTP {res.status_code} {res.text[:300]}")
