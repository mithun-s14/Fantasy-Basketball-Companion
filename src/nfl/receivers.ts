import * as cheerio from "cheerio";
import { createServerSupabaseClient } from "@/lib/supabase";

export const RECEIVERS_URL = "https://football.razzball.com/wide-receiver-fantasy-points-scored-slot-vs-wide/";

// Razzball's numeric columns after Player/Pos/Team, in page order. The "%" columns are the
// share of the player's fantasy points scored from that alignment, NOT the share of snaps.
export const COLUMNS = [
  ["games", "Games"],
  ["ppg", "PPG"],
  ["slot_ppg", "Slot PPG"],
  ["slot_pct", "Slot share"],
  ["wide_ppg", "Wide PPG"],
  ["wide_pct", "Wide share"],
] as const;
export type ReceiverKey = (typeof COLUMNS)[number][0];
export type ReceiverRow = { player: string; team: string } & Record<ReceiverKey, number | null>;

export function parseReceivers(html: string): ReceiverRow[] {
  const $ = cheerio.load(html);
  return $("#neorazzstatstable tr")
    .toArray()
    .map((tr) => $(tr).find("td"))
    .filter((td) => td.length >= 10)
    .map((td) => {
      const num = (i: number) => {
        const n = parseFloat(td.eq(i).text());
        return Number.isFinite(n) ? n : null;
      };
      return {
        player: td.eq(1).text().trim(),
        team: td.eq(3).text().trim(),
        ...(Object.fromEntries(COLUMNS.map(([key], i) => [key, num(i + 4)])) as Record<ReceiverKey, number | null>),
      };
    });
}

export async function loadReceivers() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_receiver_alignment")
    .select(["player", "team", ...COLUMNS.map(([k]) => k), "scraped_at"].join(", "));
  if (error) throw error;
  return data as unknown as (ReceiverRow & { scraped_at: string })[];
}
