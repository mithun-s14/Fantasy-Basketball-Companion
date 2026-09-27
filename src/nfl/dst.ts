import { createServerSupabaseClient } from "@/lib/supabase";

// Mirrors the JSON document written by nfl/dst-streamer (PRD section 11, schema_version 1).
export interface DstTeam {
  team: string;
  opponent: string;
  is_home: boolean;
  kickoff_utc: string | null;
  lines: {
    opp_implied_total: number | null;
    spread: number | null;
    total: number | null;
    d_win_prob: number | null;
    implied_total_move: number | null;
    timestamp_utc: string | null;
  };
  opp_qb: {
    name: string | null;
    status: string | null;
    changed: boolean | null;
    career_starts: number | null;
    dropbacks: number | null;
    sack_rate: number | null;
    sack_rate_rank: number | null;
    int_rate: number | null;
    int_rate_rank: number | null;
    fumble_rate: number | null;
    fumble_rate_rank: number | null;
    low_sample: boolean | null;
    last_season?: { dropbacks: number | null; sack_rate: number | null; int_rate: number | null };
  };
  opp_offense: Record<string, number | null>;
  defense: Record<string, number | null>;
  context: {
    rest_days: number | null;
    is_divisional: boolean | null;
    roof: string | null;
    wind_mph: number | null;
    temp_f: number | null;
  };
  next_week: { opponent: string | null; is_home: boolean | null; opp_implied_total: number | null };
  flags: string[];
}

export interface DstDoc {
  schema_version: number;
  season: number;
  week: number;
  generated_at_utc: string;
  stage: string;
  scoring_preset: string;
  /** Ordered like config/flags.yaml. */
  flag_legend: { flag: string; rule: string }[];
  teams: DstTeam[];
}

export const PRESETS = {
  espn_default: "ESPN",
  sleeper_default: "Sleeper",
  yahoo_default: "Yahoo",
} as const;
export type Preset = keyof typeof PRESETS;

// Latest published week for a preset (highest season, then week).
export async function loadDstDoc(preset: Preset): Promise<DstDoc | null> {
  const { data, error } = await createServerSupabaseClient()
    .from("nfl_dst_rankings")
    .select("doc")
    .eq("scoring_preset", preset)
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  // PostgrestError is a plain object, not an Error.
  if (error) throw new Error(error.message);
  return (data?.doc as DstDoc | undefined) ?? null;
}

type Value = number | string | null;

export interface Column {
  key: string;
  label: string;
  /** Header group shown above the column. */
  group: string;
  get: (t: DstTeam) => Value;
  /** League rank, 1 = most favorable for the D/ST. */
  rank?: (t: DstTeam) => number | null;
  format: (v: Value, t: DstTeam) => string;
  /** Sort direction on first click: ascending when a lower value is better for the D/ST. */
  lowFirst?: boolean;
  title?: string;
}

const num = (digits: number) => (v: Value) => (typeof v === "number" ? v.toFixed(digits) : "–");
const pct = (v: Value) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "–");
const signed = (v: Value) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v}` : "–");
const text = (v: Value) => (v === null || v === "" ? "–" : String(v));

export const COLUMNS: Column[] = [
  { key: "implied", label: "Opp implied", group: "Lines", get: (t) => t.lines.opp_implied_total, format: num(1), lowFirst: true, title: "Opponent's implied team total: (total − opponent spread) / 2" },
  { key: "spread", label: "Spread", group: "Lines", get: (t) => t.lines.spread, format: signed, lowFirst: true },
  { key: "total", label: "O/U", group: "Lines", get: (t) => t.lines.total, format: num(1), lowFirst: true },
  { key: "win", label: "Win %", group: "Lines", get: (t) => t.lines.d_win_prob, format: (v) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "–"), title: "From de-vigged moneylines" },
  { key: "move", label: "Move", group: "Lines", get: (t) => t.lines.implied_total_move, format: (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : "–"), lowFirst: true, title: "Change in opponent implied total since the week's first snapshot" },
  { key: "qb", label: "Opp QB", group: "Opposing QB", get: (t) => t.opp_qb.name, format: text },
  { key: "qb_starts", label: "Starts", group: "Opposing QB", get: (t) => t.opp_qb.career_starts, format: text, lowFirst: true, title: "Career regular-season starts" },
  { key: "qb_db", label: "Dropbacks", group: "Opposing QB", get: (t) => t.opp_qb.dropbacks, format: text, title: "Sample size for the QB rates (this season)" },
  { key: "qb_sack", label: "Sack %", group: "Opposing QB", get: (t) => t.opp_qb.sack_rate, rank: (t) => t.opp_qb.sack_rate_rank, format: pct },
  { key: "qb_int", label: "INT %", group: "Opposing QB", get: (t) => t.opp_qb.int_rate, rank: (t) => t.opp_qb.int_rate_rank, format: pct },
  { key: "qb_fum", label: "Fum %", group: "Opposing QB", get: (t) => t.opp_qb.fumble_rate, rank: (t) => t.opp_qb.fumble_rate_rank, format: pct },
  { key: "o_sack", label: "Sack % allowed", group: "Opposing offense", get: (t) => t.opp_offense.sack_rate_allowed, rank: (t) => t.opp_offense.sack_rate_allowed_rank, format: pct },
  { key: "o_give", label: "Giveaways/g", group: "Opposing offense", get: (t) => t.opp_offense.giveaways_per_game, rank: (t) => t.opp_offense.giveaways_per_game_rank, format: num(1) },
  { key: "o_pts", label: "Pts/g", group: "Opposing offense", get: (t) => t.opp_offense.points_per_game, rank: (t) => t.opp_offense.points_per_game_rank, format: num(1), lowFirst: true },
  { key: "o_ypp", label: "Yds/play", group: "Opposing offense", get: (t) => t.opp_offense.yards_per_play, rank: (t) => t.opp_offense.yards_per_play_rank, format: num(1), lowFirst: true },
  { key: "o_fpa", label: "FPA to D/ST", group: "Opposing offense", get: (t) => t.opp_offense.fpa_to_dst, rank: (t) => t.opp_offense.fpa_to_dst_rank, format: num(1), title: "Avg fantasy points opposing D/STs scored against this offense" },
  { key: "o_g", label: "G", group: "Opposing offense", get: (t) => t.opp_offense.games, format: text, title: "Games played (sample size)" },
  { key: "d_sacks", label: "Sacks/g", group: "D/ST", get: (t) => t.defense.sacks_per_game, rank: (t) => t.defense.sacks_per_game_rank, format: num(1) },
  { key: "d_sack", label: "Sack %", group: "D/ST", get: (t) => t.defense.sack_rate, rank: (t) => t.defense.sack_rate_rank, format: pct },
  { key: "d_ta", label: "Takeaways/g", group: "D/ST", get: (t) => t.defense.takeaways_per_game, rank: (t) => t.defense.takeaways_per_game_rank, format: num(1) },
  { key: "d_pa", label: "PA/g", group: "D/ST", get: (t) => t.defense.points_allowed_per_game, rank: (t) => t.defense.points_allowed_per_game_rank, format: num(1), lowFirst: true },
  { key: "d_ypp", label: "Yds/play allowed", group: "D/ST", get: (t) => t.defense.yards_per_play_allowed, rank: (t) => t.defense.yards_per_play_allowed_rank, format: num(1), lowFirst: true },
  { key: "d_fpts", label: "FPts/g", group: "D/ST", get: (t) => t.defense.dst_fpts_per_game, rank: (t) => t.defense.dst_fpts_per_game_rank, format: num(1), title: "D/ST fantasy points per game under the selected scoring" },
  { key: "d_td", label: "Ret TDs", group: "D/ST", get: (t) => t.defense.return_tds, format: text },
  { key: "d_g", label: "G", group: "D/ST", get: (t) => t.defense.games, format: text },
  { key: "rest", label: "Rest", group: "Context", get: (t) => t.context.rest_days, format: (v) => (typeof v === "number" ? `${v}d` : "–") },
  { key: "div", label: "Div", group: "Context", get: (t) => (t.context.is_divisional ? "Yes" : ""), format: (v) => (v ? String(v) : "–") },
  { key: "roof", label: "Roof", group: "Context", get: (t) => t.context.roof, format: text },
  { key: "wind", label: "Wind", group: "Context", get: (t) => t.context.wind_mph, format: (v) => (typeof v === "number" ? `${v} mph` : "–"), title: "Filled in by nflverse after kickoff" },
  { key: "next", label: "Next opp", group: "Next week", get: (t) => t.next_week.opponent, format: (v, t) => (v ? `${t.next_week.is_home ? "vs" : "@"} ${v}` : "Bye") },
  { key: "next_implied", label: "Next implied", group: "Next week", get: (t) => t.next_week.opp_implied_total, format: num(1), lowFirst: true },
];

export const DEFAULT_SORT = "implied";

// Nulls always sort last, whichever direction.
export function sortTeams(teams: DstTeam[], key: string, dir: "asc" | "desc"): DstTeam[] {
  const col = COLUMNS.find((c) => c.key === key) ?? COLUMNS[0];
  return [...teams].sort((a, b) => {
    const va = col.get(a);
    const vb = col.get(b);
    if (va === null || va === "") return vb === null || vb === "" ? 0 : 1;
    if (vb === null || vb === "") return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return dir === "asc" ? cmp : -cmp;
  });
}
