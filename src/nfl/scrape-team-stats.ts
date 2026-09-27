import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { STATS, parseStatTable, statUrl } from "./teamrankings";

config({ path: ".env.local" });

// TeamRankings robots.txt asks for a 10s crawl delay.
const CRAWL_DELAY_MS = 10_000;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[nfl:team-stats] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  for (const [i, stat] of STATS.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));

    const res = await fetch(statUrl(stat), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${stat}: fetch failed ${res.status}`);
    const rows = parseStatTable(await res.text(), stat);
    if (rows.length !== 32) throw new Error(`${stat}: expected 32 teams, got ${rows.length}`);

    const scraped_at = new Date().toISOString();
    const { error } = await supabase
      .from("nfl_team_stats")
      .upsert(rows.map((r) => ({ ...r, scraped_at })), { onConflict: "team,season,stat" });
    if (error) throw error;
    console.log(`[nfl:team-stats] ${stat}: upserted ${rows.length} rows (season ${rows[0].season}).`);
  }
}

main().catch((err) => {
  console.error("[nfl:team-stats]", err);
  process.exit(1);
});
