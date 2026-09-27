import polars as pl
from builders import plays, schedule

from streamer.stats.qb import career_starts, expected_starters, opposing_qb, qb_rates


def sleeper_qbs(*rows):
    cols = ["gsis_id", "full_name", "team", "depth_chart_order", "injury_status"]
    return pl.DataFrame([dict(zip(cols, r, strict=True)) | {"position": "QB"} for r in rows])


def injuries(*rows):
    cols = ["gsis_id", "report_status"]
    return pl.DataFrame(
        [
            dict(zip(cols, r, strict=True)) | {"season": 2026, "week": 4, "position": "QB"}
            for r in rows
        ],
        schema={
            "gsis_id": pl.String,
            "report_status": pl.String,
            "season": pl.Int32,
            "week": pl.Int32,
            "position": pl.String,
        },
    )


QBS = sleeper_qbs(
    ("WAS1", "Jayden Daniels", "WAS", 1, None),
    ("WAS2", "Backup Guy", "WAS", 2, None),
    ("DAL1", "Dak Prescott", "DAL", 1, "Questionable"),
    ("DAL2", "Dal Backup", "DAL", 2, None),
    ("KC1", "Patrick Mahomes", "KC", 1, "IR"),
    ("KC2", "Kc Backup", "KC", 2, "Out"),
    ("KC3", "Kc Third", "KC", 3, None),
)


def test_expected_starters():
    s = {
        r["team"]: r
        for r in expected_starters(QBS, injuries(("WAS1", "Out")), 2026, 4).iter_rows(named=True)
    }
    # Official report says Out even though Sleeper has no status: backup starts.
    assert (s["WAS"]["qb_name"], s["WAS"]["qb_changed"], s["WAS"]["listed_starter"]) == (
        "Backup Guy",
        True,
        "Jayden Daniels",
    )
    # Questionable still starts.
    assert (s["DAL"]["qb_name"], s["DAL"]["qb_status"], s["DAL"]["qb_changed"]) == (
        "Dak Prescott",
        "Questionable",
        False,
    )
    # Skips every unavailable QB down the depth chart.
    assert (s["KC"]["qb_name"], s["KC"]["qb_status"]) == ("Kc Third", "Active")


def test_qb_rates():
    qb = {"posteam": "KC", "defteam": "BUF"}
    pbp = plays(
        qb | {"play_type": "pass", "qb_dropback": 1.0, "passer_id": "Q", "complete_pass": 1.0},
        qb | {"play_type": "pass", "qb_dropback": 1.0, "passer_id": "Q", "interception": 1.0},
        qb
        | {
            "play_type": "pass",
            "qb_dropback": 1.0,
            "passer_id": "Q",
            "sack": 1.0,
            "fumble": 1.0,
            "fumbled_1_player_id": "Q",
        },
        # Scramble: a dropback, not a designed rush.
        qb
        | {
            "play_type": "run",
            "qb_dropback": 1.0,
            "passer_id": "Q",
            "rusher_id": "Q",
            "rush_attempt": 1.0,
        },
        qb | {"play_type": "run", "rusher_id": "Q", "rush_attempt": 1.0},  # designed run
        qb | {"play_type": "no_play", "qb_dropback": 1.0, "passer_id": "Q", "sack": 1.0},  # penalty
    )
    r = qb_rates(pbp).row(0, named=True)
    assert (
        r["dropbacks"],
        r["attempts"],
        r["sacks"],
        r["interceptions"],
        r["rushes"],
        r["fumbles"],
    ) == (4, 2, 1, 1, 1, 1)
    assert (r["sack_rate"], r["int_rate"], r["fumble_rate"]) == (0.25, 0.5, 0.2)


def test_career_starts_counts_regular_season_before_target_week():
    sched = schedule(
        ("A", 1, "KC", "BUF", 20, 10),
        ("B", 2, "BUF", "KC", 20, 10),
        ("C", 4, "KC", "BUF", None, None),  # not played yet
    ).with_columns(home_qb_id=pl.lit("Q"), away_qb_id=pl.lit("R"))
    starts = dict(career_starts(sched, 2026, 2).iter_rows())
    assert starts == {"Q": 1, "R": 1}


def test_low_sample_qb_shows_last_season():
    starters = pl.DataFrame({"team": ["KC", "BUF"], "qb_id": ["Q", "R"]})
    now = pl.DataFrame(
        {
            "qb_id": ["Q", "R"],
            "dropbacks": [30, 120],
            "sack_rate": [0.1, 0.05],
            "int_rate": [0.02, 0.01],
            "fumble_rate": [0.01, 0.0],
        }
    )
    last = pl.DataFrame(
        {
            "qb_id": ["Q", "R"],
            "dropbacks": [500, 400],
            "sack_rate": [0.07, 0.06],
            "int_rate": [0.03, 0.02],
        }
    )
    starts = pl.DataFrame(
        {"qb_id": ["Q"], "career_starts": [3]},
        schema={"qb_id": pl.String, "career_starts": pl.UInt32},
    )
    out = {r["team"]: r for r in opposing_qb(starters, now, last, starts).iter_rows(named=True)}
    assert (out["KC"]["low_sample"], out["KC"]["last_dropbacks"], out["KC"]["last_sack_rate"]) == (
        True,
        500,
        0.07,
    )
    assert (
        out["BUF"]["low_sample"],
        out["BUF"]["last_sack_rate"],
        out["BUF"]["career_starts"],
    ) == (False, None, 0)
