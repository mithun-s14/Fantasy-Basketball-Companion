"""`streamer refresh`: the scheduled pipeline (PRD section 10). ingest -> archive odds -> build
and publish every scoring preset, then a run summary for GitHub Actions.

Every stage runs the same steps; the stage is recorded on the published document. Tuesday's
`early` run lands after Monday Night Football, so the target week is already the next one.
"""

import os
from datetime import UTC, datetime

import polars as pl

from streamer import supabase
from streamer.build import build
from streamer.ingest.run import ingest

STAGES = ("early", "daily", "final")


def archive_odds(odds: pl.DataFrame) -> None:
    """Append this run's lines to Supabase nfl_odds_snapshots, the permanent copy (the local and
    Actions-cached snapshot files can be evicted)."""
    if odds.is_empty():
        return
    rows = odds.with_columns(pl.col("fetched_at_utc").dt.strftime("%Y-%m-%dT%H:%M:%SZ")).to_dicts()
    supabase.upsert("nfl_odds_snapshots", rows, "fetched_at_utc,espn_game_id,provider")


def summary(docs: list[dict], odds: pl.DataFrame) -> str:
    first = docs[0]
    lines = [
        f"### D/ST refresh: {first['season']} week {first['week']} ({first['stage']})",
        "",
        f"- Generated {first['generated_at_utc']}; {odds.height} game lines snapshotted",
        *[f"- `{d['scoring_preset']}`: {len(d['teams'])} D/STs published" for d in docs],
        "",
        "Lowest opponent implied totals:",
        "",
        "| D/ST | Opp | Implied | Flags |",
        "|---|---|---|---|",
    ]
    for t in [t for t in first["teams"] if t["lines"]["opp_implied_total"] is not None][:5]:
        opp = ("vs " if t["is_home"] else "@ ") + t["opponent"]
        implied = t["lines"]["opp_implied_total"]
        lines.append(f"| {t['team']} | {opp} | {implied:.1f} | {', '.join(t['flags'])} |")
    return "\n".join(lines) + "\n"


def refresh(stage: str, season: int | None = None, week: int | None = None, now=None) -> None:
    if stage not in STAGES:
        raise ValueError(f"stage must be one of {STAGES}, got {stage!r}")
    now = now or datetime.now(UTC)
    season, week, odds = ingest(season, week, now)
    archive_odds(odds)
    docs = build(season, week, None, stage=stage, publish=True, now=now)
    report = summary(docs, odds)
    print(report)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as f:
            f.write(report)
