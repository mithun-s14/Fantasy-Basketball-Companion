import * as cheerio from "cheerio";
import { createServerSupabaseClient } from "@/lib/supabase";

// Razzball's RB zone vs gap carries, and what each defense allows on zone vs gap runs.
// Both pages use Razzball's team codes (ARZ/BLT/CLV/HST), so they join directly.
export const RUSHERS_URL = "https://football.razzball.com/zonevsgap/";
export const RUSH_DEFENSE_URL = "https://football.razzball.com/defensezonevsgap/";

export const RUSH_COLUMNS = [
  ["games", "Games"],
  ["zone_att", "Zone att"],
  ["zone_pct", "Zone %"],
  ["opp_zone_ypg", "Opp zone yds/G allowed"],
  ["gap_att", "Gap att"],
  ["gap_pct", "Gap %"],
  ["opp_gap_ypg", "Opp gap yds/G allowed"],
  ["total_att", "Total att"],
] as const;
export type RushKey = (typeof RUSH_COLUMNS)[number][0];
export type RushRow = { player: string; team: string; opp: string | null } & Record<RushKey, number | null>;

const cells = (html: string, min: number) => {
  const $ = cheerio.load(html);
  return $("#neorazzstatstable tr")
    .toArray()
    .map((tr) => $(tr).find("td").toArray().map((td) => $(td).text().trim()))
    .filter((td) => td.length >= min);
};
const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);

/** Player rows; opp and opp_* are left null for mergeRushDefense to fill. */
export function parseRushers(html: string): RushRow[] {
  return cells(html, 11).map((c) => ({
    player: c[1],
    team: c[2],
    games: num(c[3]),
    zone_att: num(c[4]),
    zone_pct: num(c[5]),
    gap_att: num(c[6]),
    gap_pct: num(c[7]),
    total_att: num(c[10]),
    opp: null,
    opp_zone_ypg: null,
    opp_gap_ypg: null,
  }));
}

/** Team code -> its rush defense (zone/gap yds per game allowed) and next opponent ("BYE" on bye weeks). */
export function parseRushDefense(html: string) {
  return new Map(
    cells(html, 13)
      .filter((c) => c[1] !== "NFL Average")
      .map((c) => [c[1], { zone: num(c[3]), gap: num(c[4]), next: c[8] }] as const),
  );
}

export function mergeRushDefense(rows: RushRow[], defense: ReturnType<typeof parseRushDefense>): RushRow[] {
  return rows.map((r) => {
    const opp = defense.get(r.team)?.next ?? null;
    const d = opp ? defense.get(opp) : undefined;
    return { ...r, opp, opp_zone_ypg: d?.zone ?? null, opp_gap_ypg: d?.gap ?? null };
  });
}

export async function loadRushers() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_rb_zone_gap")
    .select(["player", "team", "opp", ...RUSH_COLUMNS.map(([k]) => k), "scraped_at"].join(", "));
  if (error) throw error;
  return data as unknown as (RushRow & { scraped_at: string })[];
}
