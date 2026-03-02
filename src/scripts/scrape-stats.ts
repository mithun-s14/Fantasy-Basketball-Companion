import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Team abbreviation → full name map (NBA.com and BBRef use abbreviations)
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

const BBREF_ABR_TO_FULL: Record<string, string> = {
  ...TEAM_ABR_TO_FULL,
  BRK: "Brooklyn Nets",
  CHO: "Charlotte Hornets",
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
// NBA.com scrape
// ---------------------------------------------------------------------------
async function fetchNbaStats(lastNGames: 0 | 10): Promise<StatRow[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let curlReq: { get: (url: string, opts: Record<string, unknown>) => Promise<{ status: number; data: unknown }> };
  try {
    const mod = require("curl-cffi");
    curlReq = mod.req ?? mod.default?.req;
    if (!curlReq?.get) throw new Error("curl-cffi: could not resolve req.get");
  } catch (err) {
    console.warn("[scrape-stats] curl-cffi not available:", err);
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
    const res = await curlReq.get(url, {
      impersonate: "chrome136",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://www.nba.com",
        Referer: "https://www.nba.com/",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
      },
    });

    if (res.status !== 200) {
      console.warn(`[scrape-stats] NBA.com returned ${res.status}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = res.data as any;
    const resultSet = json?.resultSets?.[0];
    if (!resultSet) return null;

    const headers: string[] = resultSet.headers;
    const idx = (name: string) => headers.indexOf(name);

    const iPlayerName = idx("PLAYER_NAME");
    const iTeamAbr   = idx("TEAM_ABBREVIATION");
    const iPts  = idx("PTS");
    const iReb  = idx("REB");
    const iAst  = idx("AST");
    const iStl  = idx("STL");
    const iBlk  = idx("BLK");
    const iTov  = idx("TOV");
    const i3pm  = idx("FG3M");
    const iFgm  = idx("FGM");
    const iFga  = idx("FGA");
    const iFtm  = idx("FTM");
    const iFta  = idx("FTA");

    if ([iPlayerName, iTeamAbr, iPts, iReb, iAst, iStl, iBlk, iTov, i3pm, iFgm, iFga, iFtm, iFta].some(i => i === -1)) {
      console.warn("[scrape-stats] NBA.com response missing expected columns");
      return null;
    }

    const statType: "season" | "last10" = lastNGames === 0 ? "season" : "last10";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (resultSet.rowSet as any[][]).map((row): StatRow => ({
      player_name: String(row[iPlayerName]).normalize("NFC"),
      nba_team:    TEAM_ABR_TO_FULL[row[iTeamAbr]] ?? String(row[iTeamAbr]),
      stat_type:   statType,
      pts:      Number(row[iPts])  || 0,
      reb:      Number(row[iReb])  || 0,
      ast:      Number(row[iAst])  || 0,
      stl:      Number(row[iStl])  || 0,
      blk:      Number(row[iBlk])  || 0,
      tov:      Number(row[iTov])  || 0,
      three_pm: Number(row[i3pm])  || 0,
      fgm:      Number(row[iFgm])  || 0,
      fga:      Number(row[iFga])  || 0,
      ftm:      Number(row[iFtm])  || 0,
      fta:      Number(row[iFta])  || 0,
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
    const seenPlayers = new Set<string>();

    $("#per_game_stats tbody tr").each((_, el) => {
      const tds = $(el).find("td");
      if (tds.length === 0) return;

      const playerName = $(el).find('[data-stat="name_display"]').text().trim();
      const teamAbr    = $(el).find('[data-stat="team_name_abbr"]').text().trim();

      if (!playerName) return;
      // Skip duplicate rows for traded players — keep only first occurrence
      // (BBRef lists a combined xTM row first, then per-team rows)
      if (seenPlayers.has(playerName)) return;
      seenPlayers.add(playerName);
      // Resolve team: xTM rows don't have a real team — use empty string fallback
      const resolvedTeam = BBREF_ABR_TO_FULL[teamAbr] ?? teamAbr;

      const g = (key: string) => parseFloat($(el).find(`[data-stat="${key}"]`).text()) || 0;

      rows.push({
        player_name: playerName.normalize("NFC"),
        nba_team:    resolvedTeam,
        stat_type:   "season",
        pts:      g("pts_per_g"),
        reb:      g("trb_per_g"),
        ast:      g("ast_per_g"),
        stl:      g("stl_per_g"),
        blk:      g("blk_per_g"),
        tov:      g("tov_per_g"),
        three_pm: g("fg3_per_g"),
        fgm:      g("fg_per_g"),
        fga:      g("fga_per_g"),
        ftm:      g("ft_per_g"),
        fta:      g("fta_per_g"),
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

  console.log("[scrape-stats] Trying NBA.com for season averages…");
  const nbaSeasonRows = await fetchNbaStats(0);

  console.log("[scrape-stats] Trying NBA.com for last-10 averages…");
  const nbaLast10Rows = await fetchNbaStats(10);

  const allRows: StatRow[] = [];

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
