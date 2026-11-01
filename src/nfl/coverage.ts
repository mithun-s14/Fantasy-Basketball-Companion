import * as cheerio from "cheerio";
import { createServerSupabaseClient } from "@/lib/supabase";

export const COVERAGE_URL = "https://www.sharpfootballanalysis.com/stats-nfl/nfl-coverage-schemes/";
export const TENDENCIES_URL = "https://www.sharpfootballanalysis.com/stats-nfl/nfl-defensive-tendencies/";

// Each page's table columns in page order, after Team.
export const COVERAGE_COLUMNS = [
  ["man_rate", "Man"],
  ["zone_rate", "Zone"],
  ["middle_closed_rate", "Middle closed"],
  ["middle_open_rate", "Middle open"],
] as const;
export const TENDENCY_COLUMNS = [
  ["blitz_rate", "Blitz"],
  ["light_box_rate", "Light box"],
  ["heavy_box_rate", "Heavy box"],
  ["sub_package_rate", "Sub package"],
] as const;
export const COLUMNS = [...COVERAGE_COLUMNS, ...TENDENCY_COLUMNS];
export type CoverageKey = (typeof COLUMNS)[number][0];
export type CoverageRow = { team: string } & Record<CoverageKey, number | null>;

// A Sharp wpDataTable: Team, then one numeric column per entry in `columns`.
export function parseCoverage(html: string, columns: readonly (readonly [string, string])[] = COVERAGE_COLUMNS) {
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
        ...(Object.fromEntries(columns.map(([key], i) => [key, num(i + 1)])) as Record<string, number | null>),
      };
    });
}

export async function loadCoverage() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_coverage_schemes")
    .select(["team", ...COLUMNS.map(([k]) => k), "scraped_at"].join(", "));
  if (error) throw error;
  return data as unknown as (CoverageRow & { scraped_at: string })[];
}
