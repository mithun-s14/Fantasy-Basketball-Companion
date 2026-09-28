import pytest

from streamer.teams import TEAMS, canon

# Team identifiers as each source returned them on 2026-09-26.
ESPN_ABBRS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU",
    "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI",
    "PIT", "SEA", "SF", "TB", "TEN", "WSH",
]  # fmt: skip
SLEEPER_DST_IDS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU",
    "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI",
    "PIT", "SEA", "SF", "TB", "TEN", "WAS",
]  # fmt: skip


@pytest.mark.parametrize(
    "source",
    [ESPN_ABBRS, SLEEPER_DST_IDS, list(TEAMS), list(TEAMS.values())],
    ids=["espn", "sleeper", "nflverse", "full_names"],
)
def test_every_source_maps_to_all_32_teams(source):
    assert {canon(t) for t in source} == set(TEAMS)


def test_aliases_and_case():
    assert canon("LAR") == canon("los angeles rams ") == "LA"
    assert canon("WSH") == "WAS"


def test_unknown_team_raises():
    with pytest.raises(ValueError, match="Unknown NFL team"):
        canon("OAK")
