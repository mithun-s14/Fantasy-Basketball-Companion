import * as cheerio from "cheerio";
import { createServerSupabaseClient } from "@/lib/supabase";

export const COVERAGE_URL = "https://www.sharpfootballanalysis.com/stats-nfl/nfl-coverage-schemes/";

// Table columns in page order, after Team.
export const COLUMNS = [
  ["man_rate", "Man"],
  ["zone_rate", "Zone"],
  ["middle_closed_rate", "Middle closed"],
  ["middle_open_rate", "Middle open"],
] as const;
export type CoverageKey = (typeof COLUMNS)[number][0];
export type CoverageRow = { team: string } & Record<CoverageKey, number | null>;

// The page's wpDataTable: Team, Man Rate, Zone Rate, Middle Closed Rate, Middle Open Rate.
export function parseCoverage(html: string): CoverageRow[] {
  const $ = cheerio.load(html);
  return $("table.wpDataTable tbody tr")
    .toArray()
    .map((tr) => {
      const td = $(tr).find("td");
      const num = (i: number) => {
        const n = parseFloat(td.eq(i).text());
        return Number.isFinite(n) ? n : null;
      };
      return {
        team: td.eq(0).text().trim(),
        ...(Object.fromEntries(COLUMNS.map(([key], i) => [key, num(i + 1)])) as Record<CoverageKey, number | null>),
      };
    });
}

export async function loadCoverage() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_coverage_schemes")
    .select("team, man_rate, zone_rate, middle_closed_rate, middle_open_rate, scraped_at");
  if (error) throw error;
  return data as (CoverageRow & { scraped_at: string })[];
}
