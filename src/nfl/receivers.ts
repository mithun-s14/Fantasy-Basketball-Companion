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

// What each defense allows to WRs from the slot vs out wide (Razzball, PPR PPG), keyed by nflverse team code.
export const DEFENSE_URL = "https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/";
const RAZZ_TO_NFLVERSE: Record<string, string> = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU" };
export function parseDefenseAlignment(html: string): Map<string, { slot: number | null; wide: number | null }> {
  const $ = cheerio.load(html);
  const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);
  return new Map(
    $("#neorazzstatstable tr")
      .toArray()
      .map((tr) => $(tr).find("td"))
      .filter((td) => td.length >= 8)
      .map((td) => {
        const code = td.eq(1).text().trim();
        return [RAZZ_TO_NFLVERSE[code] ?? code, { slot: num(td.eq(3).text()), wide: num(td.eq(4).text()) }] as const;
      }),
  );
}

export async function loadReceivers() {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_receiver_alignment")
    .select(["player", "team", "opp", ...COLUMNS.map(([k]) => k), ...USAGE_COLUMNS.map(([k]) => k), "scraped_at"].join(", "));
  if (error) throw error;
  return data as unknown as (ReceiverRow & Usage & { scraped_at: string })[];
}

// Usage + next-game matchup from nflverse's public CSVs, merged onto the Razzball rows by name.
// Shares are stored as percents (0-100) so the "_pct" formatting applies.
export const NFLVERSE = {
  stats: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
  snaps: (season: number) => `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`,
  games: "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
};
export const USAGE_COLUMNS = [
  ["snap_pct", "Snap %"],
  ["tgt_pg", "Tgt/G"],
  ["tgt_pct", "Tgt share"],
  ["tgt_l3_pct", "Tgt share L3"],
  ["air_pct", "Air yd share"],
  ["team_total", "Team total"],
  ["opp_wr_ppg", "Opp WR PPG allowed"],
  ["opp_slot_ppg", "Opp slot PPG allowed"],
  ["opp_wide_ppg", "Opp wide PPG allowed"],
] as const;
export type UsageKey = (typeof USAGE_COLUMNS)[number][0];
export type Usage = { opp: string | null } & Record<UsageKey, number | null>;

type Rec = Record<string, string>;

export function parseCsv(text: string): Rec[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n") (row.push(field), rows.push(row), (row = []), (field = ""));
    else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// Razzball, nflverse stats and PFR snap counts spell names slightly differently ("Jr.", "D.J.").
// ALIASES maps a normalized Razzball name to nflverse's; add one when the scrape logs a miss.
const ALIASES: Record<string, string> = { "joshua palmer": "josh palmer" };
export const normName = (s: string) => {
  const n = s
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
  return ALIASES[n] ?? n;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x: number | null) => (x == null ? null : x * 100);

/** Per-WR usage keyed by normName, plus the matchup for each player's next unplayed regular-season game. */
export function buildUsage(stats: Rec[], snaps: Rec[], games: Rec[], season: number) {
  // Razzball lists some players nflverse files as TE (e.g. Jackson Meeks), so match both.
  const wr = stats.filter((r) => (r.position === "WR" || r.position === "TE") && r.season_type === "REG");

  // Defense -> PPR points allowed to WRs per game played.
  const allowed = new Map<string, { pts: number; games: Set<string> }>();
  for (const r of stats.filter((r) => r.season_type === "REG")) {
    const d = allowed.get(r.opponent_team) ?? { pts: 0, games: new Set() };
    d.games.add(r.game_id);
    if (r.position === "WR") d.pts += Number(r.fantasy_points_ppr) || 0;
    allowed.set(r.opponent_team, d);
  }

  // Team -> its game in the current week (the earliest week with an unplayed game). Bye teams get none.
  const unplayed = games.filter((g) => Number(g.season) === season && g.game_type === "REG" && g.result === "");
  const week = Math.min(...unplayed.map((g) => Number(g.week)));
  const next = new Map<string, { opp: string; total: number | null }>();
  for (const g of unplayed) {
    if (Number(g.week) !== week) continue;
    const total = g.total_line === "" ? null : Number(g.total_line);
    const spread = g.spread_line === "" ? null : Number(g.spread_line); // home team's expected margin
    const implied = (home: boolean) => (total == null || spread == null ? null : (total + (home ? spread : -spread)) / 2);
    if (!next.has(g.home_team)) next.set(g.home_team, { opp: g.away_team, total: implied(true) });
    if (!next.has(g.away_team)) next.set(g.away_team, { opp: `@${g.home_team}`, total: implied(false) });
  }

  const snapPct = new Map<string, number[]>();
  for (const s of snaps) {
    if ((s.position !== "WR" && s.position !== "TE") || s.game_type !== "REG" || !(Number(s.offense_snaps) > 0)) continue;
    const k = normName(s.player);
    snapPct.set(k, [...(snapPct.get(k) ?? []), Number(s.offense_pct)]);
  }

  const byPlayer = new Map<string, Rec[]>();
  for (const r of wr) {
    const k = normName(r.player_display_name);
    byPlayer.set(k, [...(byPlayer.get(k) ?? []), r]);
  }

  // Slot/wide allowed come from Razzball's defense page; the scrape fills them in.
  const out = new Map<string, Omit<Usage, "opp_slot_ppg" | "opp_wide_ppg">>();
  for (const [k, rows] of byPlayer) {
    rows.sort((a, b) => Number(a.week) - Number(b.week));
    const n = (r: Rec, f: string) => Number(r[f]) || 0;
    const team = rows.at(-1)!.team;
    const m = next.get(team);
    const d = m && allowed.get(m.opp.replace("@", ""));
    out.set(k, {
      snap_pct: pct(avg(snapPct.get(k) ?? [])),
      tgt_pg: avg(rows.map((r) => n(r, "targets"))),
      tgt_pct: pct(avg(rows.map((r) => n(r, "target_share")))),
      tgt_l3_pct: pct(avg(rows.slice(-3).map((r) => n(r, "target_share")))),
      air_pct: pct(avg(rows.map((r) => n(r, "air_yards_share")))),
      opp: m?.opp ?? null,
      team_total: m?.total ?? null,
      opp_wr_ppg: d && d.games.size ? d.pts / d.games.size : null,
    });
  }
  return out;
}
