import polars as pl
import pytest
from builders import plays, schedule

from streamer.stats.defense import defense_stats
from streamer.stats.fantasy_points import components, load_preset, score
from streamer.stats.matchups import week_matchups
from streamer.stats.offense import offense_stats
from streamer.stats.ranks import add_ranks

KC_BALL = {"posteam": "KC", "defteam": "BUF"}
BUF_BALL = {"posteam": "BUF", "defteam": "KC"}
PBP = plays(
    KC_BALL | {"play_type": "pass", "qb_dropback": 1.0, "sack": 1.0, "yards_gained": -7.0},
    KC_BALL | {"play_type": "pass", "qb_dropback": 1.0, "interception": 1.0},
    KC_BALL
    | {
        "play_type": "run",
        "yards_gained": 10.0,
        "fumble": 1.0,
        "fumble_lost": 1.0,
        "fumbled_1_team": "KC",
        "fumble_recovery_1_team": "BUF",
    },
    KC_BALL | {"play_type": "run", "yards_gained": 5.0},
    BUF_BALL | {"play_type": "pass", "qb_dropback": 1.0, "yards_gained": 20.0},
    BUF_BALL | {"play_type": "run", "yards_gained": 4.0},
    KC_BALL
    | {"play_type": "punt", "special_teams_play": 1.0, "yards_gained": 0.0},  # not a scrimmage play
    KC_BALL | {"week": 2, "game_id": "G2", "play_type": "run", "yards_gained": 8.0},
)
SCHED = schedule(("G1", 1, "BUF", "KC", 27, 13), ("G2", 2, "BUF", "KC", 10, 3))
SCORED = score(components(PBP, SCHED), load_preset("sleeper_default"))


def test_offense_stats():
    kc = offense_stats(PBP, SCORED).filter(pl.col("team") == "KC").row(0, named=True)
    # KC offense over 2 games: 2 dropbacks, 1 sack, INT + fumble lost, 5 plays for 16 yards.
    assert kc["games"] == 2
    assert (kc["sack_rate_allowed"], kc["giveaways_per_game"]) == (0.5, 1.0)
    assert (kc["points_per_game"], kc["yards_per_play"]) == (8.0, pytest.approx(16 / 5))
    # BUF D/ST vs KC: G1 1 sack + 2 INT + 2 fum rec, PA 13 -> 4 = 9; G2 PA 3 -> 7.
    assert kc["fpa_to_dst"] == 8.0


def test_defense_stats():
    buf = defense_stats(PBP, SCORED).filter(pl.col("team") == "BUF").row(0, named=True)
    assert (buf["games"], buf["sacks_per_game"], buf["sack_rate"]) == (2, 0.5, 0.5)
    assert (buf["takeaways_per_game"], buf["points_allowed_per_game"]) == (1.0, 8.0)
    assert (buf["yards_per_play_allowed"], buf["dst_fpts_per_game"], buf["return_tds"]) == (
        pytest.approx(16 / 5),
        8.0,
        0,
    )


def test_ranks_one_is_most_favorable_for_dst():
    df = add_ranks(
        pl.DataFrame(
            {"opp_points_per_game": [30.0, 17.0, 17.0], "def_sack_rate": [0.1, 0.05, 0.08]}
        )
    )
    assert df["opp_points_per_game_rank"].to_list() == [3, 1, 1]  # fewer points = better
    assert df["def_sack_rate_rank"].to_list() == [1, 3, 2]  # more sacks = better


def test_week_matchups_context():
    sched = schedule(("G3", 4, "BUF", "NE", None, None)).with_columns(
        roof=pl.lit("outdoors"),
        temp=pl.lit(None),
        wind=pl.lit(None),
        div_game=pl.lit(1),
        home_rest=pl.lit(7),
        away_rest=pl.lit(10),
    )
    rows = {r["team"]: r for r in week_matchups(sched, 2026, 4).iter_rows(named=True)}
    assert (rows["BUF"]["opponent"], rows["BUF"]["is_home"], rows["BUF"]["rest_days"]) == (
        "NE",
        True,
        7,
    )
    assert (rows["NE"]["is_home"], rows["NE"]["rest_days"], rows["NE"]["is_divisional"]) == (
        False,
        10,
        True,
    )
    assert rows["NE"]["kickoff_utc"].isoformat() == "2026-09-13T17:00:00+00:00"
