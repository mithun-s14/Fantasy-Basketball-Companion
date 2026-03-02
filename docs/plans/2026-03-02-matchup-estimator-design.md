# Matchup Estimator — Design Document

**Date:** 2026-03-02
**Status:** Approved

---

## Overview

A new `/matchup` page that lets signed-in users project their fantasy basketball head-to-head matchup. Users select a date range and a stat type (season or last 10 games), then compare their saved roster against an opponent's roster across 9 standard H2H categories. The page is protected — authentication required.

---

## Architecture

```
GitHub Actions (daily cron)
  └── src/scripts/scrape-stats.ts
        ├── Primary: NBA.com (curl-cffi-node, browser fingerprinting)
        │     → season averages + last 10 game averages
        └── Fallback: Basketball-Reference
              → season averages only
        └── Upserts into Supabase: player_stats table

/matchup page (protected)
  ├── Reads user roster from roster_players (existing)
  ├── Reads opponent roster from opponent_players (new)
  ├── Reads stats from player_stats (new)
  └── Queries game counts via existing games table / API
```

No live API calls at estimation time — all stats are pre-seeded into Supabase.

---

## Data Model

### `opponent_players` (new table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → auth.users |
| player_name | text | |
| nba_team | text | |
| created_at | timestamptz | |

RLS policies: SELECT / INSERT / DELETE scoped to `auth.uid() = user_id`. Mirrors `roster_players` exactly.

### `player_stats` (new table)

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| player_name | text | |
| nba_team | text | |
| stat_type | text | `'season'` or `'last10'` |
| pts | float | Per-game average |
| reb | float | |
| ast | float | |
| stl | float | |
| blk | float | |
| tov | float | |
| three_pm | float | 3-pointers made per game |
| fgm | float | Field goals made per game |
| fga | float | Field goal attempts per game |
| ftm | float | Free throws made per game |
| fta | float | Free throw attempts per game |
| updated_at | timestamptz | |

Unique constraint on `(player_name, stat_type)` — enables clean daily upserts.

FG% and FT% are **not** stored directly. They are derived at estimation time to correctly weight high-usage players:
- `team_fg% = sum(fgm × games) / sum(fga × games)`
- `team_ft% = sum(ftm × games) / sum(fta × games)`

---

## Stats Pipeline

### `src/scripts/scrape-stats.ts` (new file)

1. Uses `curl-cffi-node` with browser fingerprinting to fetch NBA.com stats
2. Attempts both `stat_type = 'season'` and `stat_type = 'last10'` from NBA.com
3. On NBA.com failure (bot detection, parse error, non-200): falls back to Basketball-Reference for `stat_type = 'season'` only; `last10` rows are skipped that run
4. Upserts all rows into `player_stats` via Supabase service role key
5. Does **not** modify `src/scripts/scrape.ts` (game schedule scraper)

### `package.json`
```
"scrape-stats": "npx ts-node src/scripts/scrape-stats.ts"
```

### `.github/workflows/scrape-stats.yml` (new file)

- Trigger: `cron: '0 8 * * *'` (8am UTC daily, after overnight games finish)
- Steps: checkout → install deps → `npm run scrape-stats`
- Secrets used: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already configured for Vercel deployment)
- On failure: workflow errors visibly in GitHub Actions; app continues serving the previous day's stats

---

## Matchup Estimation Logic

### Counting stats (PTS, REB, AST, STL, BLK, 3PM, TO)

```
projected_total = per_game_avg × games_in_date_range
team_total = sum of projected_total across all roster players
```

Games in date range is looked up from the existing `games` Supabase table, same query used by the Schedule Analyzer.

### Percentage stats (FG%, FT%)

Weighted by usage across the full roster:
```
team_fg% = sum(fgm × games) / sum(fga × games)
team_ft% = sum(ftm × games) / sum(fta × games)
```

### Category winner rules

| Category | Winner |
|---|---|
| PTS, REB, AST, STL, BLK, 3PM, FG%, FT% | Higher projected total |
| TO | Lower projected total |

Each category awards 1 point to the winner. Ties result in no point awarded. Overall winner wins the most categories out of 9.

### Edge cases

- **Player not in `player_stats`**: shown with a warning icon next to their name; excluded from projections. The affected roster's totals are flagged as incomplete.
- **No stats in database** (scraper hasn't run yet): page shows an empty state explaining stats update daily.
- **Player has 0 games in the date range**: projected total is 0 for that player — they still appear in the roster list.

---

## Pages & Components

### New files

| Path | Type | Purpose |
|---|---|---|
| `src/app/(main)/matchup/page.tsx` | Server component | Fetches both rosters, passes to MatchupClient |
| `src/app/(main)/matchup/actions.ts` | Server Actions | `addOpponentPlayer`, `removeOpponentPlayer` |
| `src/components/MatchupClient.tsx` | Client component | Owns date range state, stat type toggle, triggers projection |
| `src/components/MatchupProjectionTable.tsx` | Client component | 9-category comparison table with winner highlights |

### UI layout

```
┌─────────────────────────────────────────────────┐
│  Date Range: [start] → [end]   Stats: [Season ▼]│
├──────────────────────┬──────────────────────────┤
│  Your Roster         │  Opponent's Roster        │
│  [player list]       │  [player list + add/remove│
│                      │   same UI as RosterClient] │
├──────────────────────┴──────────────────────────┤
│  Matchup Projection                              │
│  Category   You      Opponent   Winner           │
│  PTS        142.3    128.7      ✓                │
│  REB        ...                                  │
│  ...                                             │
│  Overall: You win 6–3                            │
└─────────────────────────────────────────────────┘
```

Desktop: two-column roster layout. Mobile: stacked. Colors match existing pages throughout (same Tailwind palette, shadcn/ui components, badge color conventions from `TeamScheduleTable`).

The opponent roster add/remove UI reuses the player autocomplete search pattern from `RosterClient.tsx`.

### Middleware & Navbar

- `/matchup` added to the protected routes list in `src/middleware.ts`
- Matchup link added to `src/components/Navbar.tsx` and `src/components/MobileNav.tsx`

---

## Testing

- Unit tests: matchup estimation logic (projection calculations, category winner logic, weighted FG%/FT%)
- Component tests: `MatchupProjectionTable` rendering, winner highlight logic, missing-player warning state
- E2E: add opponent player, select date range, verify projection table renders
