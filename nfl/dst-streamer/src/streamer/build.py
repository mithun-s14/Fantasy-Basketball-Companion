"""`streamer build`: table -> JSON + Markdown (+ Supabase) for each scoring preset."""

from datetime import UTC, datetime

from streamer import report
from streamer.flags import load_flags
from streamer.ingest import nflverse
from streamer.stats.fantasy_points import SCORING_DIR, load_preset
from streamer.table import build_table, load_inputs, load_overrides


def build(
    season: int | None,
    week: int | None,
    presets: list[str] | None,
    stage: str = "manual",
    publish: bool = False,
    now: datetime | None = None,
) -> list[dict]:
    now = now or datetime.now(UTC)
    season = season or nflverse.current_season()
    inp = load_inputs(season)
    week = week or nflverse.target_week(inp.schedules, now)
    presets = presets or sorted(p.stem for p in SCORING_DIR.glob("*.yaml"))
    flags_cfg, overrides = load_flags(), load_overrides()

    docs = []
    for name in presets:
        table = build_table(inp, season, week, load_preset(name), flags_cfg, now, overrides)
        meta = {
            "season": season,
            "week": week,
            "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stage": stage,
            "scoring_preset": name,
            "league_id": None,
        }
        doc = report.to_doc(table, meta, flags_cfg)
        paths = report.write_outputs(doc)
        print(f"{name}: {len(doc['teams'])} D/STs -> {', '.join(map(str, paths))}")
        if publish:
            report.publish(doc)
            print(f"  published {season} week {week} {name} to Supabase")
        docs.append(doc)
    return docs
