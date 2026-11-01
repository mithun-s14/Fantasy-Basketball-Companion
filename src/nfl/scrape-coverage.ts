import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { COVERAGE_URL, parseCoverage } from "./coverage";

config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[nfl:coverage] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const res = await fetch(COVERAGE_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const rows = parseCoverage(await res.text());
  if (rows.length !== 32) throw new Error(`expected 32 teams, got ${rows.length}`);

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
