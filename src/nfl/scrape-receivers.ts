import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { parseReceivers, RECEIVERS_URL } from "./receivers";

config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[nfl:receivers] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const res = await fetch(RECEIVERS_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch ${RECEIVERS_URL} failed ${res.status}`);
  const rows = parseReceivers(await res.text());
  if (rows.length < 50) throw new Error(`expected a full WR table, got ${rows.length} rows`);

  // Replace the whole table so players who fall off Razzball's list don't linger.
  const db = createClient(supabaseUrl, supabaseKey).from("nfl_receiver_alignment");
  const scraped_at = new Date().toISOString();
  const { error } = await db.upsert(rows.map((r) => ({ ...r, scraped_at })), { onConflict: "player" });
  if (error) throw error;
  const { error: delError } = await db.delete().lt("scraped_at", scraped_at);
  if (delError) throw delError;
  console.log(`[nfl:receivers] upserted ${rows.length} rows.`);
}

main().catch((err) => {
  console.error("[nfl:receivers]", err);
  process.exit(1);
});
