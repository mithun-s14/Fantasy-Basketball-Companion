import * as cheerio from "cheerio";

// TeamRankings stat page slugs to scrape: https://www.teamrankings.com/nfl/stat/<slug>
export const STATS = [
  "opponent-field-goals-made-per-game",
  "field-goal-attempts-per-game",
];

export const statUrl = (stat: string) =>
  `https://www.teamrankings.com/nfl/stat/${stat}`;

export interface TeamStatRow {
  team: string;
  season: number;
  stat: string;
  season_avg: number | null;
  last3: number | null;
  last1: number | null;
  home: number | null;
  away: number | null;
  prev_season_avg: number | null;
}

// "new-york-giants" -> "New York Giants". The link slug carries the full name;
// the visible cell text is abbreviated ("NY Giants").
const slugToName = (slug: string) =>
  slug.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/-/g, " ");

// Every TeamRankings stat page shares these columns:
// Rank, Team, <season>, Last 3, Last 1, Home, Away, <prev season>
export function parseStatTable(html: string, stat: string): TeamStatRow[] {
  const $ = cheerio.load(html);
  const table = $("table.tr-table").first();
  const season = parseInt(table.find("thead th").eq(2).text(), 10);
  if (!season) throw new Error(`${stat}: could not read season from table header`);

  return table
    .find("tbody tr")
    .toArray()
    .map((tr) => {
      const td = $(tr).find("td");
      // data-sort holds full precision; the visible text is rounded to 0.1.
      const num = (i: number) => {
        const n = parseFloat(td.eq(i).attr("data-sort") ?? "");
        return Number.isFinite(n) ? n : null;
      };
      const slug = td.eq(1).find("a").attr("href")?.split("/").pop();
      return {
        team: slug ? slugToName(slug) : td.eq(1).text().trim(),
        season,
        stat,
        season_avg: num(2),
        last3: num(3),
        last1: num(4),
        home: num(5),
        away: num(6),
        prev_season_avg: num(7),
      };
    });
}
