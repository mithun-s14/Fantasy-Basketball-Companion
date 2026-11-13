import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { buildUsage, DEFENSE_URL, NFLVERSE, normName, parseCsv, parseDefenseAlignment, parseReceivers, RECEIVERS_URL, USAGE_COLUMNS } from "./receivers";

config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[nfl:receivers] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const page = async (url: string) => {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`fetch ${url} failed ${res.status}`);
    return res.text();
  };
  const rows = parseReceivers(await page(RECEIVERS_URL));
  const defense = parseDefenseAlignment(await page(DEFENSE_URL));
  if (defense.size < 32) throw new Error(`expected 32 defenses, got ${defense.size}`);
  if (rows.length < 50) throw new Error(`expected a full WR table, got ${rows.length} rows`);

  // NFL season starts in September; Jan/Feb games still belong to the prior year's season.
  const now = new Date();
  const season = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const csv = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url} failed ${r.status}`);
    return parseCsv(await r.text());
  };
  const [stats, snaps, games] = await Promise.all([csv(NFLVERSE.stats(season)), csv(NFLVERSE.snaps(season)), csv(NFLVERSE.games)]);
  const usage = buildUsage(stats, snaps, games, season);
  const empty = { opp: null, ...Object.fromEntries(USAGE_COLUMNS.map(([k]) => [k, null])) };
  const merged = rows.map((r) => {
    const m = { ...r, ...empty, ...usage.get(normName(r.player)) };
    const d = m.opp ? defense.get(m.opp.replace("@", "")) : undefined;
    return { ...m, opp_slot_ppg: d?.slot ?? null, opp_wide_ppg: d?.wide ?? null };
  });
  const unmatched = merged.filter((r) => r.tgt_pg == null).map((r) => r.player);
  if (unmatched.length) console.warn(`[nfl:receivers] no nflverse match for ${unmatched.length}: ${unmatched.join(", ")}`);

  // Replace the whole table so players who fall off Razzball's list don't linger.
  const db = createClient(supabaseUrl, supabaseKey).from("nfl_receiver_alignment");
  const scraped_at = new Date().toISOString();
  const { error } = await db.upsert(merged.map((r) => ({ ...r, scraped_at })), { onConflict: "player" });
  if (error) throw error;
  const { error: delError } = await db.delete().lt("scraped_at", scraped_at);
  if (delError) throw delError;
  console.log(`[nfl:receivers] upserted ${rows.length} rows.`);
}

main().catch((err) => {
  console.error("[nfl:receivers]", err);
  process.exit(1);
});
