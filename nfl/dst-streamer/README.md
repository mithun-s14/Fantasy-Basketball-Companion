# D/ST streamer pipeline

Collects, computes and publishes the stats for every NFL D/ST matchup each week. The table is
shown in the app at `/nfl/dst`. It displays stats only: no projections or composite scores.

## Running it

Python 3.12 with [uv](https://docs.astral.sh/uv/), from this folder:

```bash
uv sync
uv run pytest
uv run streamer ingest                     # cache nflverse + Sleeper data, snapshot ESPN lines
uv run streamer build                      # JSON + Markdown to data/rankings/, every scoring preset
uv run streamer build --publish            # ...and upsert to Supabase for /nfl/dst
uv run streamer refresh --stage daily      # what the schedule runs: ingest + build --publish
uv run streamer validate-points --season 2025 --scoring espn_default
```

Seasons are labeled by start year (2026 = the 2026-27 season). `--season` and `--week` default
to the current season and the next week with games still to kick off.

Publishing needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, from the
environment or the app's `.env.local`, and the tables in `sql/nfl/nfl_dst_rankings.sql` and
`sql/nfl/nfl_odds_snapshots.sql`.

## Schedule (`.github/workflows/nfl-dst-refresh.yml`)

| Stage | When (UTC) | Eastern | Purpose |
|---|---|---|---|
| early | Tue 11:07 | 7:07 / 6:07 am | After MNF: next week's table for waivers |
| daily | Wed-Sat 14:07 | 10:07 / 9:07 am | Refresh odds and injuries |
| final | Thu 21:37 | 5:37 / 4:37 pm | Before TNF |
| final | Sun 15:37 | 11:37 / 10:37 am | Before the 1 pm games, final QB statuses |

Every stage runs the same steps. It can also be run by hand from the Actions tab
("Run workflow"), with an optional week override.

- Scheduled workflows run only from the default branch (`master`).
- **GitHub disables scheduled workflows in a public repository after 60 days without repository
  activity.** After an offseason, re-enable it in Actions -> NFL D/ST refresh -> "Enable
  workflow".
- `data/` is carried between runs with `actions/cache` (line movement needs the week's earlier
  snapshots). Every odds snapshot is also appended to Supabase `nfl_odds_snapshots`, the
  permanent copy.
- A failed run goes red, publishes nothing (the page keeps the last good build), and writes a
  short job summary.

Repository secrets used: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Columns

Season-to-date, regular season only, through the week before the target week. Ranks: 1 = most
favorable for the D/ST, among the teams playing that week.

| Column | Definition | Source |
|---|---|---|
| opponent, is_home, rest_days, is_divisional, roof, temp_f, wind_mph | From the schedule. Weather is filled in only after kickoff | nflverse schedules |
| spread, total | The D/ST team's spread and the game total; median across bookmakers in the latest snapshot | ESPN scoreboard |
| opp_implied_total | (total + spread) / 2 = (total - opponent spread) / 2 | ESPN |
| d_win_prob | Moneyline implied probabilities, de-vigged so both sides sum to 1 | ESPN |
| implied_total_move | Opponent implied total now minus in the week's first snapshot | ESPN snapshots |
| opp_qb | Expected starter: Sleeper depth chart, skipping QBs Out/Doubtful/IR/PUP/Sus on the official injury report (or Sleeper when not on it); `config/overrides.yaml` wins | Sleeper, nflverse injuries |
| opp_qb career_starts | Regular-season starts before the target week | nflverse schedules (1999-) |
| opp_qb dropbacks, sack_rate, int_rate, fumble_rate | Dropbacks incl. sacks and scrambles; sacks / dropbacks; INT / pass attempts; fumbles (lost or not) / (dropbacks + designed runs). Under 50 dropbacks, last season's rates are shown too | nflverse play-by-play |
| opp sack_rate_allowed, giveaways_per_game | Sacks / dropbacks; (INT + fumbles lost) / games | nflverse play-by-play |
| opp points_per_game, yards_per_play | All points scored / games; scrimmage yards / scrimmage plays (two-point tries excluded) | nflverse |
| opp fpa_to_dst | Average D/ST fantasy points scored against this offense, under the selected preset | derived |
| def sacks_per_game, sack_rate | Sacks / games; sacks / opponent dropbacks | nflverse play-by-play |
| def takeaways_per_game | (INT + all fumble recoveries, special teams included) / games; matches ESPN's official totalTakeaways | nflverse play-by-play |
| def points_allowed_per_game, yards_per_play_allowed | Opponent final score / games; opponent scrimmage yards / plays | nflverse |
| dst_fpts_per_game | D/ST fantasy points / games under the preset (`config/scoring/`) | derived |
| dst_return_tds | Defensive + special teams TDs this season | nflverse play-by-play |
| next_opponent, next_opp_implied_total | The following week's matchup and line, when posted | nflverse, ESPN |
| flags | Rule-based, thresholds in `config/flags.yaml`; informational only | derived |

Scoring presets: `espn_default` (the owner's ESPN league settings), `sleeper_default` (derived
from Sleeper's own weekly stats; 2026 values), `yahoo_default` (Yahoo help: default league
settings). `streamer validate-points` checks computed D/ST points against Sleeper's weekly stats.

## Attribution

Play-by-play, schedules, injuries and player IDs: [nflverse](https://nflverse.com) (nflreadpy).
Betting lines: ESPN's public scoreboard. Depth charts and player status: Sleeper's public API.
