import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { COVERAGE_COLUMNS, COVERAGE_URL, parseCoverage, TENDENCIES_URL, TENDENCY_COLUMNS } from "./coverage";

config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[nfl:coverage] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const scrape = async (url: string, columns: Parameters<typeof parseCoverage>[1]) => {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`fetch ${url} failed ${res.status}`);
    const rows = parseCoverage(await res.text(), columns);
    if (rows.length !== 32) throw new Error(`expected 32 teams from ${url}, got ${rows.length}`);
    return rows;
  };
  const coverage = await scrape(COVERAGE_URL, COVERAGE_COLUMNS);
  const tendencies = new Map((await scrape(TENDENCIES_URL, TENDENCY_COLUMNS)).map((r) => [r.team, r]));
  const rows = coverage.map((r) => {
    const t = tendencies.get(r.team);
    if (!t) throw new Error(`no defensive tendencies row for ${r.team}`);
    return { ...r, ...t };
  });

  const scraped_at = new Date().toISOString();
  const { error } = await createClient(supabaseUrl, supabaseKey)
    .from("nfl_coverage_schemes")
    .upsert(rows.map((r) => ({ ...r, scraped_at })), { onConflict: "team" });
  if (error) throw error;
  console.log(`[nfl:coverage] upserted ${rows.length} rows.`);
}

main().catch((err) => {
  console.error("[nfl:coverage]", err);
  process.exit(1);
});
