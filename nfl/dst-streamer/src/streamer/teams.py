"""Canonical team abbreviations (nflverse codes) and aliases from every source.

Sources and how they name teams:
- nflverse: canonical codes below (Rams = "LA").
- ESPN: abbreviations, except Rams = "LAR" and Washington = "WSH"; also full display names.
- Sleeper: D/ST player IDs are abbreviations, except Rams = "LAR".
- TeamRankings (via the app's nfl_team_stats table) and The Odds API: full names.
"""

TEAMS: dict[str, str] = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams",
    "LAC": "Los Angeles Chargers",
    "LV": "Las Vegas Raiders",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots",
    "NO": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers",
    "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
}

_ALIASES = {"LAR": "LA", "WSH": "WAS"}
_LOOKUP = (
    {code: code for code in TEAMS} | _ALIASES | {name.upper(): code for code, name in TEAMS.items()}
)


def canon(team: str) -> str:
    """Map any source's abbreviation or full name to the canonical code. Unknown teams raise."""
    try:
        return _LOOKUP[team.strip().upper()]
    except KeyError:
        raise ValueError(f"Unknown NFL team: {team!r}") from None
