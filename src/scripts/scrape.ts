import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load .env.local for standalone script execution
config({ path: ".env.local" });

const SEASON = "2025-26";
const BBREF_YEAR = "2026";
const MONTHS = [
  "october",
  "november",
  "december",
  "january",
  "february",
  "march",
  "april",
];

interface ScrapedGame {
  game_date: string;
  home_team: string;
  away_team: string;
  season: string;
  venue: string | null;
  bbref_url: string | null;
}

function parseDate(dateStr: string): string {
  // Input format: "Sun, Feb 1, 2026"
  const parsed = new Date(dateStr);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCompetitors(competitors: { name: string }[]): { awayTeam: string; homeTeam: string } {
  // competitor[0] = away team, competitor[1] = home team
  return { awayTeam: competitors[0].name, homeTeam: competitors[1].name };
}

async function scrapeMonth(month: string): Promise<ScrapedGame[]> {
  const url = `https://www.basketball-reference.com/leagues/NBA_${BBREF_YEAR}_games-${month}.html`;
  console.log(`Fetching ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      console.warn(`  No page for ${month} (404), skipping.`);
      return [];
    }
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const games: ScrapedGame[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");

      // Handle both single object and array formats
      const events = Array.isArray(json) ? json : [json];

      for (const event of events) {
        if (event["@type"] !== "SportsEvent") continue;
        if (!event.competitor || event.competitor.length < 2) continue;

        const { awayTeam, homeTeam } = parseCompetitors(event.competitor);
        const gameDate = parseDate(event.startDate);
        const venue = event.location?.name || null;
        const bbrefUrl = event.url || null;

        games.push({
          game_date: gameDate,
          home_team: homeTeam,
          away_team: awayTeam,
          season: SEASON,
          venue,
          bbref_url: bbrefUrl,
        });
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  });

  console.log(`  Found ${games.length} games in ${month}.`);
  return games;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let totalProcessed = 0;

  for (const month of MONTHS) {
    const games = await scrapeMonth(month);

    if (games.length === 0) continue;

    const { error } = await supabase.from("games").upsert(games, {
      onConflict: "game_date,home_team,away_team",
      ignoreDuplicates: true,
    });

    if (error) {
      console.error(`  Error inserting ${month} games:`, error.message);
    } else {
      totalProcessed += games.length;
      console.log(`  Inserted/skipped ${games.length} games for ${month}.`);
    }

    // Rate limit: 3 seconds between requests to be respectful
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log(`\nDone! Processed ${totalProcessed} total games.`);
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
