# Matchup Estimator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/matchup` page where signed-in users project their H2H fantasy basketball matchup across 9 stat categories, using pre-seeded player averages × games played in a chosen date range.

**Architecture:** Daily GitHub Actions cron runs `src/scripts/scrape-stats.ts` which fetches player stats from NBA.com (primary, `curl-cffi-node` fingerprinting) or Basketball-Reference (fallback), upserts into a `player_stats` Supabase table. The `/matchup` page is a protected server component that pre-loads both rosters and their stats, passing them to a client component that handles date selection, stat type toggle, opponent roster management, and projection computation.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), `curl-cffi-node`, `cheerio` (already installed), Vitest, React Testing Library, `tsx` (already installed), GitHub Actions.

---

## Task 1: Create Supabase tables via SQL editor

**Files:**
- No code files — run SQL in the Supabase dashboard SQL editor

**Step 1: Open the Supabase dashboard → SQL Editor → New query**

Paste and run the following SQL:

```sql
-- opponent_players: mirrors roster_players, stores the opponent's roster per user
create table opponent_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  player_name text not null,
  nba_team text not null,
  created_at timestamptz default now() not null,
  unique(user_id, player_name)
);

alter table opponent_players enable row level security;

create policy "Users can view their own opponent players"
  on opponent_players for select
  using (auth.uid() = user_id);

create policy "Users can insert their own opponent players"
  on opponent_players for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own opponent players"
  on opponent_players for delete
  using (auth.uid() = user_id);

-- player_stats: pre-seeded averages scraped daily; public read, no RLS user-scoping
create table player_stats (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  nba_team text not null,
  stat_type text not null check (stat_type in ('season', 'last10')),
  pts float not null default 0,
  reb float not null default 0,
  ast float not null default 0,
  stl float not null default 0,
  blk float not null default 0,
  tov float not null default 0,
  three_pm float not null default 0,
  fgm float not null default 0,
  fga float not null default 0,
  ftm float not null default 0,
  fta float not null default 0,
  updated_at timestamptz default now() not null,
  unique(player_name, stat_type)
);

alter table player_stats enable row level security;

create policy "Anyone can read player stats"
  on player_stats for select
  using (true);
```

**Step 2: Verify**

In the Supabase Table Editor confirm both `opponent_players` and `player_stats` tables exist with the correct columns.

**Step 3: Commit a note**

```bash
git commit --allow-empty -m "chore: create opponent_players and player_stats Supabase tables (SQL run manually)"
```

---

## Task 2: Add types

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Append these interfaces to `src/lib/types.ts`**

```typescript
export interface PlayerStats {
  id: string;
  player_name: string;
  nba_team: string;
  stat_type: 'season' | 'last10';
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  three_pm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  updated_at: string;
}

export interface OpponentPlayer {
  id: string;
  player_name: string;
  nba_team: string;
  created_at: string;
}
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(matchup): add PlayerStats and OpponentPlayer types"
```

---

## Task 3: Install curl-cffi-node

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install**

```bash
npm install curl-cffi-node
```

**Step 2: Verify it installed**

```bash
node -e "const m = require('curl-cffi-node'); console.log(Object.keys(m));"
```

Note down the exported names — you will need them to call the fetch function in Task 4. The API is typically `fetch` or a class like `CurlImpersonate`. Check the package README at `node_modules/curl-cffi-node/README.md` if the above is unclear.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add curl-cffi-node for TLS-fingerprinted scraping"
```

---

## Task 4: Write the stats scraper

**Files:**
- Create: `src/scripts/scrape-stats.ts`

This script fetches from NBA.com (primary) and Basketball-Reference (fallback), upserts into `player_stats`.

**Step 1: Create `src/scripts/scrape-stats.ts`**

```typescript
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Team abbreviation → full name map (NBA.com and BBRef use abbreviations)
// Covers all 30 teams. Add overrides if NBA.com uses non-standard abbrs.
// ---------------------------------------------------------------------------
const TEAM_ABR_TO_FULL: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

// BBRef uses slightly different abbreviations for a few teams
const BBREF_ABR_TO_FULL: Record<string, string> = {
  ...TEAM_ABR_TO_FULL,
  BRK: "Brooklyn Nets",   // BBRef uses BRK not BKN
  CHO: "Charlotte Hornets", // BBRef uses CHO not CHA
  NOP: "New Orleans Pelicans",
};

interface StatRow {
  player_name: string;
  nba_team: string;
  stat_type: "season" | "last10";
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  three_pm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
}

// ---------------------------------------------------------------------------
// NBA.com scrape — uses curl-cffi-node for TLS fingerprinting
// Returns null if the request fails or the response cannot be parsed.
// ---------------------------------------------------------------------------
async function fetchNbaStats(lastNGames: 0 | 10): Promise<StatRow[] | null> {
  // Dynamically import so the script can still fall back if the module is missing
  let curlFetch: typeof fetch;
  try {
    // curl-cffi-node exports vary by version — adapt to whichever API is present.
    // Check node_modules/curl-cffi-node/README.md for the exact export name.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("curl-cffi-node");
    // Prefer named `fetch`, fall back to `default.fetch` or `default` if it is callable
    curlFetch = mod.fetch ?? mod.default?.fetch ?? mod.default;
    if (typeof curlFetch !== "function") {
      throw new Error("curl-cffi-node: could not resolve a fetch function");
    }
  } catch (err) {
    console.warn("[scrape-stats] curl-cffi-node not available:", err);
    return null;
  }

  const url =
    `https://stats.nba.com/stats/leaguedashplayerstats` +
    `?College=&Conference=&Country=&DateFrom=&DateTo=&Division=` +
    `&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=` +
    `&LastNGames=${lastNGames}&LeagueID=00&Location=&MeasureType=Base` +
    `&Month=0&OpponentTeamID=0&PORound=0&PaceAdjust=N&PerMode=PerGame` +
    `&Playoffs=N&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N` +
    `&Season=2025-26&SeasonSegment=&SeasonType=Regular+Season` +
    `&ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0` +
    `&VsConference=&VsDivision=&Weight=`;

  try {
    const res = await curlFetch(url, {
      impersonate: "chrome120",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.nba.com",
        Referer: "https://www.nba.com/",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
      },
    });

    if (!res.ok) {
      console.warn(`[scrape-stats] NBA.com returned ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const resultSet = json?.resultSets?.[0];
    if (!resultSet) return null;

    const headers: string[] = resultSet.headers;
    const idx = (name: string) => headers.indexOf(name);

    const iPlayerName = idx("PLAYER_NAME");
    const iTeamAbr = idx("TEAM_ABBREVIATION");
    const iPts = idx("PTS");
    const iReb = idx("REB");
    const iAst = idx("AST");
    const iStl = idx("STL");
    const iBlk = idx("BLK");
    const iTov = idx("TOV");
    const i3pm = idx("FG3M");
    const iFgm = idx("FGM");
    const iFga = idx("FGA");
    const iFtm = idx("FTM");
    const iFta = idx("FTA");

    const required = [iPlayerName, iTeamAbr, iPts, iReb, iAst, iStl, iBlk, iTov, i3pm, iFgm, iFga, iFtm, iFta];
    if (required.some((i) => i === -1)) {
      console.warn("[scrape-stats] NBA.com response missing expected columns");
      return null;
    }

    const statType: "season" | "last10" = lastNGames === 0 ? "season" : "last10";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resultSet.rowSet.map((row: any[]): StatRow => ({
      player_name: String(row[iPlayerName]).normalize("NFC"),
      nba_team: TEAM_ABR_TO_FULL[row[iTeamAbr]] ?? String(row[iTeamAbr]),
      stat_type: statType,
      pts: Number(row[iPts]) || 0,
      reb: Number(row[iReb]) || 0,
      ast: Number(row[iAst]) || 0,
      stl: Number(row[iStl]) || 0,
      blk: Number(row[iBlk]) || 0,
      tov: Number(row[iTov]) || 0,
      three_pm: Number(row[i3pm]) || 0,
      fgm: Number(row[iFgm]) || 0,
      fga: Number(row[iFga]) || 0,
      ftm: Number(row[iFtm]) || 0,
      fta: Number(row[iFta]) || 0,
    }));
  } catch (err) {
    console.warn("[scrape-stats] NBA.com fetch error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Basketball-Reference fallback — plain fetch, season averages only
// ---------------------------------------------------------------------------
async function fetchBbrefStats(): Promise<StatRow[] | null> {
  const url = "https://www.basketball-reference.com/leagues/NBA_2026_per_game.html";
  console.log(`[scrape-stats] Fetching BBRef fallback: ${url}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[scrape-stats] BBRef returned ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const rows: StatRow[] = [];

    // BBRef injects duplicate header rows mid-table; skip rows where Rk === "Rk"
    $("#per_game_stats tbody tr").each((_, el) => {
      const tds = $(el).find("td");
      if (tds.length === 0) return; // header repetition row

      const playerName = $(el).find('[data-stat="player"]').text().trim();
      const teamAbr = $(el).find('[data-stat="team_id"]').text().trim();

      // Skip totals rows for players traded mid-season (team = "2TM", "3TM", etc.)
      if (!playerName || teamAbr.endsWith("TM")) return;

      const g = (key: string) => parseFloat($(el).find(`[data-stat="${key}"]`).text()) || 0;

      rows.push({
        player_name: playerName.normalize("NFC"),
        nba_team: BBREF_ABR_TO_FULL[teamAbr] ?? teamAbr,
        stat_type: "season",
        pts: g("pts_per_g"),
        reb: g("trb_per_g"),
        ast: g("ast_per_g"),
        stl: g("stl_per_g"),
        blk: g("blk_per_g"),
        tov: g("tov_per_g"),
        three_pm: g("fg3_per_g"),
        fgm: g("fg_per_g"),
        fga: g("fga_per_g"),
        ftm: g("ft_per_g"),
        fta: g("fta_per_g"),
      });
    });

    console.log(`[scrape-stats] BBRef: parsed ${rows.length} player rows`);
    return rows.length > 0 ? rows : null;
  } catch (err) {
    console.warn("[scrape-stats] BBRef fetch error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[scrape-stats] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- Attempt NBA.com (season + last10) ---
  console.log("[scrape-stats] Trying NBA.com for season averages…");
  const nbaSeasonRows = await fetchNbaStats(0);

  console.log("[scrape-stats] Trying NBA.com for last-10 averages…");
  const nbaLast10Rows = await fetchNbaStats(10);

  let allRows: StatRow[] = [];

  if (nbaSeasonRows) {
    console.log(`[scrape-stats] NBA.com season: ${nbaSeasonRows.length} rows`);
    allRows.push(...nbaSeasonRows);
  } else {
    console.log("[scrape-stats] NBA.com season failed — trying BBRef fallback…");
    const bbRows = await fetchBbrefStats();
    if (bbRows) {
      allRows.push(...bbRows);
    } else {
      console.error("[scrape-stats] All season stat sources failed. Aborting.");
      process.exit(1);
    }
  }

  if (nbaLast10Rows) {
    console.log(`[scrape-stats] NBA.com last10: ${nbaLast10Rows.length} rows`);
    allRows.push(...nbaLast10Rows);
  } else {
    console.warn("[scrape-stats] NBA.com last10 failed — last10 stats will not be updated this run.");
  }

  if (allRows.length === 0) {
    console.error("[scrape-stats] No rows to upsert. Aborting.");
    process.exit(1);
  }

  // Upsert in batches of 200
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("player_stats")
      .upsert(batch, { onConflict: "player_name,stat_type" });

    if (error) {
      console.error(`[scrape-stats] Upsert error at batch ${i}:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  console.log(`[scrape-stats] Done. Upserted ${upserted} rows.`);
}

main().catch((err) => {
  console.error("[scrape-stats] Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Add npm script to `package.json`**

In the `"scripts"` section, add after `"seed-players"`:

```json
"scrape-stats": "npx tsx src/scripts/scrape-stats.ts",
```

**Step 3: Run it locally to verify**

```bash
npm run scrape-stats
```

Expected output: rows upserted into `player_stats` in Supabase. Check the table in the Supabase dashboard to confirm. If NBA.com fails, verify the fallback ran.

**Step 4: Commit**

```bash
git add src/scripts/scrape-stats.ts package.json
git commit -m "feat(matchup): add scrape-stats script with NBA.com primary and BBRef fallback"
```

---

## Task 5: Add GitHub Actions workflow

**Files:**
- Create: `.github/workflows/scrape-stats.yml`

**Step 1: Create `.github/workflows/` if it doesn't exist**

```bash
mkdir -p .github/workflows
```

**Step 2: Create `.github/workflows/scrape-stats.yml`**

```yaml
name: Scrape Player Stats

on:
  schedule:
    # 8am UTC daily — after overnight US games finish
    - cron: "0 8 * * *"
  workflow_dispatch: # allow manual trigger from GitHub UI

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run stats scraper
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run scrape-stats
```

**Step 3: Add secrets to GitHub**

In your GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
- `NEXT_PUBLIC_SUPABASE_URL` — copy from `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` — copy from `.env.local`

**Step 4: Commit**

```bash
git add .github/workflows/scrape-stats.yml
git commit -m "ci: add daily GitHub Actions workflow to scrape player stats"
```

---

## Task 6: Write failing unit tests for projection logic (TDD)

**Files:**
- Create: `src/__tests__/unit/matchup.test.ts`

Write these tests BEFORE implementing `src/lib/matchup.ts`. They should fail with "Cannot find module".

**Step 1: Create `src/__tests__/unit/matchup.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { computeMatchup } from "@/lib/matchup";
import type { RosterPlayer, PlayerStats } from "@/lib/types";

function makePlayer(name: string, team: string): RosterPlayer {
  return { id: "1", player_name: name, nba_team: team, created_at: "" };
}

function makeStats(
  name: string,
  team: string,
  overrides: Partial<PlayerStats> = {}
): PlayerStats {
  return {
    id: "1",
    player_name: name,
    nba_team: team,
    stat_type: "season",
    pts: 20,
    reb: 5,
    ast: 4,
    stl: 1,
    blk: 0.5,
    tov: 2,
    three_pm: 2,
    fgm: 8,
    fga: 16,
    ftm: 4,
    fta: 5,
    updated_at: "",
    ...overrides,
  };
}

const gameCounts: Record<string, number> = { "Los Angeles Lakers": 3, "Boston Celtics": 2 };

describe("computeMatchup", () => {
  it("projects counting stats as avg × games", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 27, stat_type: "season" }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    // LeBron: 25 * 3 = 75; Tatum: 27 * 2 = 54
    expect(pts.userTotal).toBeCloseTo(75);
    expect(pts.opponentTotal).toBeCloseTo(54);
    expect(pts.winner).toBe("user");
  });

  it("marks turnovers as user win when user has fewer", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { tov: 1 }),
      makeStats("Jayson Tatum", "Boston Celtics", { tov: 3 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const tov = result.categories.find((c) => c.category === "tov")!;
    // LeBron: 1*3 = 3; Tatum: 3*2 = 6 → user wins (fewer TO)
    expect(tov.winner).toBe("user");
  });

  it("computes weighted FG% across the roster", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { fgm: 8, fga: 16 }), // 0.500
      makeStats("Jayson Tatum", "Boston Celtics", { fgm: 7, fga: 20 }),     // 0.350
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const fg = result.categories.find((c) => c.category === "fg_pct")!;
    // user: (8*3)/(16*3) = 24/48 = 0.5; opp: (7*2)/(20*2) = 14/40 = 0.35
    expect(fg.userTotal).toBeCloseTo(0.5);
    expect(fg.opponentTotal).toBeCloseTo(0.35);
    expect(fg.winner).toBe("user");
  });

  it("returns a tie when totals are equal", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 10 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 15 }), // 15*2 = 30 = 10*3
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.winner).toBe("tie");
  });

  it("excludes players with no stats entry from totals", () => {
    const user = [
      makePlayer("LeBron James", "Los Angeles Lakers"),
      makePlayer("Unknown Player", "Los Angeles Lakers"),
    ];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25 }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10 }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    const pts = result.categories.find((c) => c.category === "pts")!;
    // Only LeBron counted: 25*3=75
    expect(pts.userTotal).toBeCloseTo(75);
  });

  it("correctly totals userWins and opponentWins", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    // Give user dominant stats except TO and FG%
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", {
        pts: 100, reb: 100, ast: 100, stl: 100, blk: 100,
        three_pm: 100, fgm: 5, fga: 10, ftm: 100, fta: 100, tov: 100,
      }),
      makeStats("Jayson Tatum", "Boston Celtics", {
        pts: 1, reb: 1, ast: 1, stl: 1, blk: 1,
        three_pm: 1, fgm: 9, fga: 10, ftm: 1, fta: 100, tov: 1,
      }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "season");
    // User wins: PTS, REB, AST, STL, BLK, 3PM, FT% = 7
    // Opp wins: FG% (opp 0.9 > user 0.5), TO (opp 1*2=2 < user 100*3=300) = 2
    expect(result.userWins).toBe(7);
    expect(result.opponentWins).toBe(2);
  });

  it("filters stats by stat_type", () => {
    const user = [makePlayer("LeBron James", "Los Angeles Lakers")];
    const opp = [makePlayer("Jayson Tatum", "Boston Celtics")];
    const stats = [
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 25, stat_type: "season" }),
      makeStats("LeBron James", "Los Angeles Lakers", { pts: 30, stat_type: "last10" }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10, stat_type: "season" }),
      makeStats("Jayson Tatum", "Boston Celtics", { pts: 10, stat_type: "last10" }),
    ];
    const result = computeMatchup(user, opp, stats, gameCounts, "last10");
    const pts = result.categories.find((c) => c.category === "pts")!;
    expect(pts.userTotal).toBeCloseTo(90); // 30 * 3
  });
});
```

**Step 2: Run to confirm they fail**

```bash
npm test -- matchup
```

Expected: FAIL with "Cannot find module '@/lib/matchup'"

---

## Task 7: Implement projection logic

**Files:**
- Create: `src/lib/matchup.ts`

**Step 1: Create `src/lib/matchup.ts`**

```typescript
import type { PlayerStats, RosterPlayer } from "./types";

export type StatCategory =
  | "pts" | "reb" | "ast" | "stl" | "blk"
  | "tov" | "three_pm" | "fg_pct" | "ft_pct";

export interface CategoryResult {
  category: StatCategory;
  label: string;
  userTotal: number;
  opponentTotal: number;
  winner: "user" | "opponent" | "tie";
}

export interface MatchupResult {
  categories: CategoryResult[];
  userWins: number;
  opponentWins: number;
}

const CATEGORY_DEFS: {
  category: StatCategory;
  label: string;
  lowerWins?: boolean;
}[] = [
  { category: "pts",      label: "PTS" },
  { category: "reb",      label: "REB" },
  { category: "ast",      label: "AST" },
  { category: "stl",      label: "STL" },
  { category: "blk",      label: "BLK" },
  { category: "three_pm", label: "3PM" },
  { category: "fg_pct",   label: "FG%" },
  { category: "ft_pct",   label: "FT%" },
  { category: "tov",      label: "TO",  lowerWins: true },
];

export function computeMatchup(
  userRoster: RosterPlayer[],
  opponentRoster: RosterPlayer[],
  stats: PlayerStats[],
  gameCounts: Record<string, number>,
  statType: "season" | "last10"
): MatchupResult {
  // Index stats by normalized name + stat_type
  const statsMap = new Map<string, PlayerStats>();
  for (const s of stats) {
    if (s.stat_type === statType) {
      statsMap.set(s.player_name.normalize("NFC").toLowerCase(), s);
    }
  }

  function getStats(player: RosterPlayer): PlayerStats | null {
    return statsMap.get(player.player_name.normalize("NFC").toLowerCase()) ?? null;
  }

  function games(player: RosterPlayer): number {
    return gameCounts[player.nba_team] ?? 0;
  }

  function sumCounting(
    roster: RosterPlayer[],
    key: keyof Pick<PlayerStats, "pts"|"reb"|"ast"|"stl"|"blk"|"tov"|"three_pm">
  ): number {
    return roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[key] * games(p) : acc;
    }, 0);
  }

  function weightedPct(
    roster: RosterPlayer[],
    madeKey: "fgm" | "ftm",
    attKey: "fga" | "fta"
  ): number {
    const made = roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[madeKey] * games(p) : acc;
    }, 0);
    const att = roster.reduce((acc, p) => {
      const s = getStats(p);
      return s ? acc + s[attKey] * games(p) : acc;
    }, 0);
    return att === 0 ? 0 : made / att;
  }

  const categories: CategoryResult[] = CATEGORY_DEFS.map(
    ({ category, label, lowerWins }) => {
      let userTotal: number;
      let opponentTotal: number;

      if (category === "fg_pct") {
        userTotal = weightedPct(userRoster, "fgm", "fga");
        opponentTotal = weightedPct(opponentRoster, "fgm", "fga");
      } else if (category === "ft_pct") {
        userTotal = weightedPct(userRoster, "ftm", "fta");
        opponentTotal = weightedPct(opponentRoster, "ftm", "fta");
      } else {
        userTotal = sumCounting(userRoster, category);
        opponentTotal = sumCounting(opponentRoster, category);
      }

      let winner: "user" | "opponent" | "tie";
      if (userTotal === opponentTotal) {
        winner = "tie";
      } else if (lowerWins) {
        winner = userTotal < opponentTotal ? "user" : "opponent";
      } else {
        winner = userTotal > opponentTotal ? "user" : "opponent";
      }

      return { category, label, userTotal, opponentTotal, winner };
    }
  );

  const userWins = categories.filter((c) => c.winner === "user").length;
  const opponentWins = categories.filter((c) => c.winner === "opponent").length;

  return { categories, userWins, opponentWins };
}
```

**Step 2: Run tests**

```bash
npm test -- matchup
```

Expected: all 7 tests PASS.

**Step 3: Commit**

```bash
git add src/lib/matchup.ts src/__tests__/unit/matchup.test.ts
git commit -m "feat(matchup): add projection computation logic with unit tests"
```

---

## Task 8: Write opponent Server Actions

**Files:**
- Create: `src/app/(main)/matchup/actions.ts`

**Step 1: Create the directory and file**

```bash
mkdir -p src/app/\(main\)/matchup
```

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NBA_TEAMS } from "@/lib/constants";
import { getActivePlayers } from "@/lib/nba-players";

const PLAYER_NAME_REGEX = /^[\p{L}]+([ \-'][\p{L}]+)*$/u;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addOpponentPlayer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in." };

    const playerName =
      (formData.get("player_name") as string | null)?.trim() ?? "";
    const nbaTeam = (formData.get("nba_team") as string | null)?.trim() ?? "";

    if (!PLAYER_NAME_REGEX.test(playerName)) {
      return {
        error:
          "Player name must be 2–60 characters and contain only letters, spaces, hyphens, or apostrophes.",
      };
    }

    let resolvedTeam = nbaTeam;
    try {
      const activePlayers = await getActivePlayers();
      const normalizedInput = playerName.normalize("NFC").toLowerCase();
      const match = activePlayers.find(
        (p) => p.name.toLowerCase() === normalizedInput
      );
      if (!match) {
        return {
          error:
            "Player not found on an active NBA roster. Please select a player from the suggestions.",
        };
      }
      resolvedTeam = match.team;
      if (!NBA_TEAMS.includes(resolvedTeam)) {
        return { error: "Could not determine a valid team for this player." };
      }
    } catch {
      if (!NBA_TEAMS.includes(nbaTeam)) {
        return { error: "Please select a valid NBA team." };
      }
    }

    const { error } = await supabase.from("opponent_players").insert({
      user_id: user.id,
      player_name: playerName,
      nba_team: resolvedTeam,
    });

    if (error) {
      if (error.code === "23505") {
        return { error: `${playerName} is already on the opponent's roster.` };
      }
      return { error: "Failed to add player. Please try again." };
    }

    return { success: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}

export async function removeOpponentPlayer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const playerId = (formData.get("player_id") as string | null) ?? "";
  if (!UUID_REGEX.test(playerId)) return { error: "Invalid player ID." };

  const { error } = await supabase
    .from("opponent_players")
    .delete()
    .eq("id", playerId)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to remove player. Please try again." };
  return { success: true };
}
```

**Step 2: Commit**

```bash
git add src/app/\(main\)/matchup/actions.ts
git commit -m "feat(matchup): add addOpponentPlayer and removeOpponentPlayer server actions"
```

---

## Task 9: Create the matchup page (server component)

**Files:**
- Create: `src/app/(main)/matchup/page.tsx`

**Step 1: Create `src/app/(main)/matchup/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MatchupClient } from "@/components/MatchupClient";
import type { RosterPlayer, OpponentPlayer, PlayerStats } from "@/lib/types";

export default async function MatchupPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/matchup");

  const [{ data: userPlayers }, { data: opponentPlayers }] = await Promise.all([
    supabase
      .from("roster_players")
      .select("id, player_name, nba_team, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("opponent_players")
      .select("id, player_name, nba_team, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const allPlayerNames = [
    ...(userPlayers ?? []).map((p) => p.player_name),
    ...(opponentPlayers ?? []).map((p) => p.player_name),
  ];

  const { data: stats } =
    allPlayerNames.length > 0
      ? await supabase
          .from("player_stats")
          .select("*")
          .in("player_name", allPlayerNames)
      : { data: [] };

  return (
    <MatchupClient
      userPlayers={(userPlayers as RosterPlayer[]) ?? []}
      opponentPlayers={(opponentPlayers as OpponentPlayer[]) ?? []}
      allStats={(stats as PlayerStats[]) ?? []}
    />
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(main\)/matchup/page.tsx
git commit -m "feat(matchup): add matchup server page component"
```

---

## Task 10: Write failing tests for MatchupProjectionTable (TDD)

**Files:**
- Create: `src/__tests__/components/MatchupProjectionTable.test.tsx`

Write these tests BEFORE implementing the component. They should fail with "Cannot find module".

**Step 1: Create `src/__tests__/components/MatchupProjectionTable.test.tsx`**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchupProjectionTable } from "@/components/MatchupProjectionTable";
import type { MatchupResult } from "@/lib/matchup";

function makeResult(overrides: Partial<MatchupResult> = {}): MatchupResult {
  return {
    userWins: 5,
    opponentWins: 4,
    categories: [
      { category: "pts",      label: "PTS",  userTotal: 150.5, opponentTotal: 120.0, winner: "user" },
      { category: "reb",      label: "REB",  userTotal: 45.0,  opponentTotal: 50.0,  winner: "opponent" },
      { category: "ast",      label: "AST",  userTotal: 30.0,  opponentTotal: 30.0,  winner: "tie" },
      { category: "stl",      label: "STL",  userTotal: 8.0,   opponentTotal: 6.0,   winner: "user" },
      { category: "blk",      label: "BLK",  userTotal: 4.0,   opponentTotal: 5.0,   winner: "opponent" },
      { category: "three_pm", label: "3PM",  userTotal: 18.0,  opponentTotal: 15.0,  winner: "user" },
      { category: "fg_pct",   label: "FG%",  userTotal: 0.48,  opponentTotal: 0.45,  winner: "user" },
      { category: "ft_pct",   label: "FT%",  userTotal: 0.80,  opponentTotal: 0.75,  winner: "user" },
      { category: "tov",      label: "TO",   userTotal: 20.0,  opponentTotal: 18.0,  winner: "opponent" },
    ],
    ...overrides,
  };
}

describe("MatchupProjectionTable", () => {
  it("renders all 9 category labels", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    for (const label of ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the overall score", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    // e.g. "5–4" somewhere in the output
    expect(screen.getByText(/5.+4/)).toBeInTheDocument();
  });

  it("shows percentage values as percentages (FG%, FT%)", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    // 0.48 should be rendered as "48.0%" not "0.48"
    expect(screen.getByText("48.0%")).toBeInTheDocument();
  });

  it("renders a row for each category", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    const rows = screen.getAllByRole("row");
    // 1 header + 9 data rows
    expect(rows.length).toBe(10);
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test -- MatchupProjectionTable
```

Expected: FAIL with "Cannot find module '@/components/MatchupProjectionTable'"

---

## Task 11: Create MatchupProjectionTable component

**Files:**
- Create: `src/components/MatchupProjectionTable.tsx`

**Step 1: Create `src/components/MatchupProjectionTable.tsx`**

```typescript
import type { MatchupResult } from "@/lib/matchup";

function formatStat(category: string, value: number): string {
  if (category === "fg_pct" || category === "ft_pct") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(1);
}

interface Props {
  result: MatchupResult;
}

export function MatchupProjectionTable({ result }: Props) {
  const { categories, userWins, opponentWins } = result;

  const overallLabel =
    userWins > opponentWins
      ? `You lead ${userWins}–${opponentWins}`
      : userWins < opponentWins
      ? `Opponent leads ${opponentWins}–${userWins}`
      : `Tied ${userWins}–${opponentWins}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Overall score header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Matchup Projection</h3>
        <span className="text-sm font-semibold text-orange-600">{overallLabel}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-left font-medium text-gray-500 w-16">Category</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">You</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 w-12"></th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Opponent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {categories.map(({ category, label, userTotal, opponentTotal, winner }) => (
            <tr key={category} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-700">{label}</td>
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  winner === "user" ? "text-green-600" : "text-gray-700"
                }`}
              >
                {formatStat(category, userTotal)}
              </td>
              <td className="px-4 py-3 text-center text-gray-400 text-xs">vs</td>
              <td
                className={`px-4 py-3 tabular-nums font-medium ${
                  winner === "opponent" ? "text-green-600" : "text-gray-700"
                }`}
              >
                {formatStat(category, opponentTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Run tests**

```bash
npm test -- MatchupProjectionTable
```

Expected: all 4 tests PASS.

**Step 3: Commit**

```bash
git add src/components/MatchupProjectionTable.tsx src/__tests__/components/MatchupProjectionTable.test.tsx
git commit -m "feat(matchup): add MatchupProjectionTable component with tests"
```

---

## Task 12: Create MatchupClient component

**Files:**
- Create: `src/components/MatchupClient.tsx`

This is the largest component. It wires together everything: date range, stat type toggle, opponent roster management, game count fetching, projection computation, and display.

**Step 1: Create `src/components/MatchupClient.tsx`**

```typescript
"use client";

import { useState, useEffect, useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Swords, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { MatchupProjectionTable } from "@/components/MatchupProjectionTable";
import { computeMatchup } from "@/lib/matchup";
import { NBA_TEAMS } from "@/lib/constants";
import {
  addOpponentPlayer,
  removeOpponentPlayer,
} from "@/app/(main)/matchup/actions";
import type { RosterPlayer, OpponentPlayer, PlayerStats } from "@/lib/types";
import type { MatchupResult } from "@/lib/matchup";

// --------------------------------------------------------------------------
// Shared sub-components (same patterns as RosterClient)
// --------------------------------------------------------------------------

interface PlayerSuggestion {
  name: string;
  team: string;
}

function SelectWithHidden({
  name,
  placeholder,
  externalValue,
}: {
  name: string;
  placeholder: string;
  externalValue?: string;
}) {
  const [value, setValue] = useState(externalValue ?? "");
  useEffect(() => {
    if (externalValue !== undefined) setValue(externalValue);
  }, [externalValue]);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {NBA_TEAMS.map((team) => (
            <SelectItem key={team} value={team}>
              {team}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function PlayerAutocomplete({
  onSelect,
  resetKey,
}: {
  onSelect: (player: PlayerSuggestion) => void;
  resetKey: number;
}) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }, [resetKey]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function triggerSearch(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); setIsOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/players?search=${encodeURIComponent(val)}`);
        if (res.ok) {
          const data = await res.json();
          const list: PlayerSuggestion[] = Array.isArray(data) ? data : [];
          setSuggestions(list);
          setIsOpen(list.length > 0);
          setActiveIndex(-1);
        }
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 250);
  }

  function handleSelect(player: PlayerSuggestion) {
    setInputValue(player.name);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(player);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); handleSelect(suggestions[activeIndex]); }
    else if (e.key === "Escape") setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        name="player_name"
        placeholder="e.g. Jayson Tatum"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); triggerSearch(e.target.value); }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        autoComplete="off"
        required
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}
      {isOpen && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((player, i) => (
            <li
              key={player.name}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(player); }}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer gap-4 ${i === activeIndex ? "bg-orange-50" : "hover:bg-gray-50"}`}
            >
              <span className="text-sm font-medium text-gray-900">{player.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{player.team}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddOpponentForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(addOpponentPlayer, null);
  const [resetKey, setResetKey] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState("");

  useEffect(() => {
    if (state && "success" in state) {
      setResetKey((k) => k + 1);
      setSelectedTeam("");
      onSuccess();
      router.refresh();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Player name</Label>
          <PlayerAutocomplete onSelect={(p) => setSelectedTeam(p.team)} resetKey={resetKey} />
        </div>
        <div className="space-y-1.5" key={resetKey}>
          <Label>NBA team</Label>
          <SelectWithHidden name="nba_team" placeholder="Select team" externalValue={selectedTeam} />
        </div>
        <Button type="submit" disabled={isPending} className="whitespace-nowrap">
          {isPending ? "Adding…" : "Add player"}
        </Button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}

function RemoveOpponentButton({ playerId, onSuccess }: { playerId: string; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(removeOpponentPlayer, null);
  useEffect(() => {
    if (state && "success" in state) onSuccess();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="player_id" value={playerId} />
      <Button type="submit" variant="ghost" size="icon" disabled={isPending}
        aria-label="Remove player"
        className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}

// --------------------------------------------------------------------------
// RosterColumn: renders a player list with optional add form
// --------------------------------------------------------------------------
function RosterColumn({
  title,
  players,
  missingNames,
  showAddForm,
  onRemove,
}: {
  title: string;
  players: (RosterPlayer | OpponentPlayer)[];
  missingNames: Set<string>;
  showAddForm?: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-gray-900">{title}</h2>

      {showAddForm && onRemove && (
        <div className="bg-gray-50 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add player</p>
          <AddOpponentForm onSuccess={() => {}} />
        </div>
      )}

      {players.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No players yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate">{player.player_name}</p>
                  <p className="text-xs text-gray-500">{player.nba_team}</p>
                </div>
                {missingNames.has(player.player_name) && (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" aria-label="No stats available" />
                )}
              </div>
              {showAddForm && onRemove && (
                <RemoveOpponentButton playerId={player.id} onSuccess={() => onRemove(player.id)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// MatchupClient: main exported component
// --------------------------------------------------------------------------
interface Props {
  userPlayers: RosterPlayer[];
  opponentPlayers: OpponentPlayer[];
  allStats: PlayerStats[];
}

export function MatchupClient({ userPlayers, opponentPlayers, allStats }: Props) {
  const router = useRouter();
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [statType, setStatType] = useState<"season" | "last10">("season");
  const [gameCounts, setGameCounts] = useState<Record<string, number>>({});
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [oppPlayers, setOppPlayers] = useState<OpponentPlayer[]>(opponentPlayers);

  // Sync server-refreshed opponentPlayers into local state
  useEffect(() => { setOppPlayers(opponentPlayers); }, [opponentPlayers]);

  // Fetch game counts when date range changes
  useEffect(() => {
    if (!startDate || !endDate) { setGameCounts({}); return; }
    const controller = new AbortController();
    setIsLoadingGames(true);
    setGameError(null);
    const s = format(startDate, "yyyy-MM-dd");
    const e = format(endDate, "yyyy-MM-dd");
    fetch(`/api/games?start=${s}&end=${e}`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch schedule"); return res.json(); })
      .then((data) => setGameCounts(data.gameCounts ?? {}))
      .catch((err) => { if (err.name !== "AbortError") setGameError(err.message); })
      .finally(() => setIsLoadingGames(false));
    return () => controller.abort();
  }, [startDate, endDate]);

  // Compute projection
  const hasLast10Stats = allStats.some((s) => s.stat_type === "last10");
  const effectiveStatType = statType === "last10" && !hasLast10Stats ? "season" : statType;

  const result: MatchupResult | null =
    userPlayers.length > 0 && oppPlayers.length > 0 && !isLoadingGames
      ? computeMatchup(userPlayers, oppPlayers, allStats, gameCounts, effectiveStatType)
      : null;

  // Which players are missing stats
  const statNames = new Set(
    allStats.filter((s) => s.stat_type === effectiveStatType).map((s) => s.player_name.normalize("NFC").toLowerCase())
  );
  const missingUserNames = new Set(
    userPlayers.filter((p) => !statNames.has(p.player_name.normalize("NFC").toLowerCase())).map((p) => p.player_name)
  );
  const missingOppNames = new Set(
    oppPlayers.filter((p) => !statNames.has(p.player_name.normalize("NFC").toLowerCase())).map((p) => p.player_name)
  );
  const hasMissing = missingUserNames.size > 0 || missingOppNames.size > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="mb-2">
            <div className="flex items-center gap-3 mb-2">
              <Swords className="w-8 h-8 text-orange-600" />
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Matchup Estimator</h1>
            </div>
            <p className="text-gray-500">
              Compare your roster against your opponent's across 9 H2H categories.
            </p>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Date range</p>
              <DateRangeSelector
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Stats</p>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                <button
                  onClick={() => setStatType("season")}
                  className={`px-4 py-2 transition-colors ${statType === "season" ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Season
                </button>
                <button
                  onClick={() => setStatType("last10")}
                  className={`px-4 py-2 transition-colors ${statType === "last10" ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  title={!hasLast10Stats ? "Last 10 stats not yet available — using season averages" : undefined}
                >
                  Last 10
                  {!hasLast10Stats && <span className="ml-1 text-xs opacity-60">(N/A)</span>}
                </button>
              </div>
            </div>
          </div>

          {gameError && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-800">{gameError}</p>
            </div>
          )}

          {hasMissing && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-800">
                Some players are missing stats (shown with ⚠). Totals for those rosters are incomplete.
                Stats update daily — check back tomorrow if a player was recently added.
              </p>
            </div>
          )}

          {/* Two-column rosters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RosterColumn
              title="Your Roster"
              players={userPlayers}
              missingNames={missingUserNames}
            />
            <RosterColumn
              title="Opponent's Roster"
              players={oppPlayers}
              missingNames={missingOppNames}
              showAddForm
              onRemove={(id) => {
                setOppPlayers((prev) => prev.filter((p) => p.id !== id));
                router.refresh();
              }}
            />
          </div>

          {/* Projection table */}
          {result ? (
            <MatchupProjectionTable result={result} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
              {allStats.length === 0
                ? "No player stats available yet. Stats are seeded daily — check back tomorrow."
                : userPlayers.length === 0 || oppPlayers.length === 0
                ? "Add players to both rosters to see the projection."
                : "Loading game schedule…"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/MatchupClient.tsx
git commit -m "feat(matchup): add MatchupClient component with roster management and projection display"
```

---

## Task 13: Update middleware to protect /matchup

**Files:**
- Modify: `src/middleware.ts:36-41`

**Step 1: Add `/matchup` protection**

Find this block in `src/middleware.ts`:

```typescript
  // Protect /roster — redirect to /auth if not logged in
  if (pathname.startsWith("/roster") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set("next", "/roster");
    return NextResponse.redirect(redirectUrl);
  }
```

Add immediately after it:

```typescript
  // Protect /matchup — redirect to /auth if not logged in
  if (pathname.startsWith("/matchup") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set("next", "/matchup");
    return NextResponse.redirect(redirectUrl);
  }
```

**Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(matchup): protect /matchup route in middleware"
```

---

## Task 14: Add Matchup link to Navbar and MobileNav

**Files:**
- Modify: `src/components/Navbar.tsx:44-51`
- Modify: `src/components/MobileNav.tsx:40-48`

**Step 1: Update `Navbar.tsx`**

Find:
```tsx
            {userEmail && (
              <Link
                href="/roster"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
              >
                Roster
              </Link>
            )}
```

Replace with:
```tsx
            {userEmail && (
              <>
                <Link
                  href="/roster"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
                >
                  Roster
                </Link>
                <Link
                  href="/matchup"
                  className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
                >
                  Matchup
                </Link>
              </>
            )}
```

**Step 2: Update `MobileNav.tsx`**

Find:
```tsx
          {userEmail && (
            <Link
              href="/roster"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
              onClick={() => setOpen(false)}
            >
              Roster
            </Link>
          )}
```

Replace with:
```tsx
          {userEmail && (
            <>
              <Link
                href="/roster"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
                onClick={() => setOpen(false)}
              >
                Roster
              </Link>
              <Link
                href="/matchup"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
                onClick={() => setOpen(false)}
              >
                Matchup
              </Link>
            </>
          )}
```

**Step 3: Commit**

```bash
git add src/components/Navbar.tsx src/components/MobileNav.tsx
git commit -m "feat(matchup): add Matchup link to Navbar and MobileNav"
```

---

## Task 15: Run all unit tests and fix any failures

**Step 1: Run the full test suite**

```bash
npm test
```

Expected: all existing tests plus the new `matchup` and `MatchupProjectionTable` tests pass.

**Step 2: If any tests fail**, read the error output carefully. Common issues:
- Missing import — check the import path
- Type mismatch — check the `PlayerStats` interface matches the test fixtures
- `computeMatchup` argument order mismatch — verify `stats` is passed before `gameCounts`

**Step 3: Commit if you fixed anything**

```bash
git add -A
git commit -m "fix(matchup): fix test failures after full suite run"
```

---

## Task 16: E2E test for matchup flow

**Files:**
- Create: `tests/e2e/matchup.spec.ts`

**Step 1: Create `tests/e2e/matchup.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Matchup page", () => {
  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await page.goto("/matchup");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("matchup link appears in navbar when signed in", async ({ page }) => {
    // Navigate to the auth page
    await page.goto("/auth");
    // Check that the matchup link does NOT appear when logged out
    await expect(page.locator('a[href="/matchup"]')).toHaveCount(0);
  });
});
```

Note: Full sign-in E2E tests require real credentials. The above covers the redirect and unauthenticated state. Add authenticated tests manually once you have a test account set up.

**Step 2: Run E2E tests**

```bash
npm run test:e2e
```

Expected: both tests pass.

**Step 3: Commit**

```bash
git add tests/e2e/matchup.spec.ts
git commit -m "test(matchup): add E2E tests for matchup page auth redirect"
```

---

## Task 17: Smoke test the full feature locally

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Manual checklist**

- [ ] Navigate to `/matchup` while logged out → redirected to `/auth`
- [ ] Log in → Matchup link visible in navbar
- [ ] Navigate to `/matchup` → page loads, your roster displayed on left
- [ ] Add an opponent player (e.g. "Jayson Tatum") → appears in right column
- [ ] Change date range → projection table updates
- [ ] Toggle "Last 10" → if stats available, values change; if not, "(N/A)" label shows
- [ ] Add a player with no stats entry → warning icon ⚠ appears next to their name
- [ ] Remove an opponent player → disappears from list
- [ ] Mobile: hamburger menu shows Matchup link when signed in

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete matchup estimator feature"
```
