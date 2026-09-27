import polars as pl
import pytest
from builders import plays, schedule

from streamer.stats.fantasy_points import components, load_preset, score

KC_BALL = {"posteam": "KC", "defteam": "BUF"}
BUF_BALL = {"posteam": "BUF", "defteam": "KC"}
TD = {"touchdown": 1.0}

PBP = plays(
    KC_BALL | {"play_type": "pass", "qb_dropback": 1.0, "sack": 1.0},
    KC_BALL | {"play_type": "pass", "interception": 1.0, "td_team": "BUF"} | TD,  # pick-six
    KC_BALL
    | {
        "fumble": 1.0,
        "fumble_forced": 1.0,
        "forced_fumble_player_1_team": "BUF",
        "fumbled_1_team": "KC",
        "fumble_recovery_1_team": "BUF",
        "fumble_lost": 1.0,
    },
    KC_BALL
    | {"play_type": "punt", "special_teams_play": 1.0, "td_team": "BUF"}
    | TD,  # punt return
    # On kickoffs posteam is the receiving team.
    BUF_BALL
    | {"play_type": "kickoff", "special_teams_play": 1.0, "kickoff_attempt": 1.0, "td_team": "BUF"}
    | TD,
    # nflverse leaves special_teams_play unset on this blocked FG return.
    KC_BALL | {"play_type": "field_goal", "field_goal_result": "blocked", "td_team": "BUF"} | TD,
    KC_BALL | {"safety": 1.0},
    # KC intercepts, fumbles on the return; BUF's offense forces and recovers it.
    BUF_BALL
    | {
        "play_type": "pass",
        "interception": 1.0,
        "fumble": 1.0,
        "fumble_forced": 1.0,
        "forced_fumble_player_1_team": "BUF",
        "fumbled_1_team": "KC",
        "fumble_recovery_1_team": "BUF",
    },
    BUF_BALL | {"safety": 1.0},  # KC defense safety: not in BUF's offense-only points allowed
    KC_BALL | {"sack": 1.0, "play_deleted": 1.0},  # deleted: ignored
    KC_BALL | {"sack": 1.0, "season_type": "POST"},  # postseason: ignored
)
SCHED = schedule(("G1", 1, "BUF", "KC", 30, 16))


def comps():
    return {r["team"]: r for r in components(PBP, SCHED).iter_rows(named=True)}


def test_components_credit_the_right_team():
    buf, kc = comps()["BUF"], comps()["KC"]
    assert {k: buf[k] for k in buf if k in COUNTS} == {
        "sack": 1,
        "interception": 1,
        "fumble_recovery": 2,  # includes BUF's offense recovering on KC's INT return
        "forced_fumble": 1,  # the one forced by BUF's offense on the return doesn't count
        "st_fumble_recovery": 0,
        "st_forced_fumble": 0,
        "safety": 1,
        "blocked_kick": 1,
        "def_td": 1,
        "st_td": 3,  # punt return, kickoff return, blocked FG return
    }
    assert (kc["interception"], kc["safety"], kc["def_td"], kc["st_td"]) == (1, 1, 0, 0)


COUNTS = {
    "sack",
    "interception",
    "fumble_recovery",
    "forced_fumble",
    "st_fumble_recovery",
    "st_forced_fumble",
    "safety",
    "blocked_kick",
    "def_td",
    "st_td",
}


def test_points_allowed_bases():
    buf, kc = comps()["BUF"], comps()["KC"]
    assert (buf["points_allowed_total"], buf["points_allowed_offense_only"]) == (16, 14)
    # KC allowed 30, minus BUF's pick-six (6) and safety (2) scored against KC's offense.
    assert (kc["points_allowed_total"], kc["points_allowed_offense_only"]) == (30, 22)


@pytest.mark.parametrize(
    ("preset", "buf", "kc"), [("sleeper_default", 37, 4), ("yahoo_default", 36, 4)]
)
def test_presets_score_hand_computed_totals(preset, buf, kc):
    # Sleeper: 1 sack + 2 INT + 4 fum rec + 1 FF + 2 safety + 2 block + 6 def TD + 18 ST TD,
    # PA 14 -> +1. Yahoo: same minus the FF, PA 14 -> +1.
    s = {
        r["team"]: r["dst_fpts"]
        for r in score(components(PBP, SCHED), load_preset(preset)).iter_rows(named=True)
    }
    assert s == {"BUF": buf, "KC": kc}


@pytest.mark.parametrize(
    ("allowed", "points"), [(0, 10), (6, 7), (7, 4), (14, 1), (20, 1), (21, 0), (34, -1), (35, -4)]
)
def test_points_allowed_tiers_including_negative_totals(allowed, points):
    quiet = plays({"posteam": "NYJ", "defteam": "MIA"})
    df = score(
        components(quiet, schedule(("G2", 1, "MIA", "NYJ", 0, allowed))),
        load_preset("sleeper_default"),
    )
    assert df.filter(pl.col("team") == "MIA")["dst_fpts"].to_list() == [points]
