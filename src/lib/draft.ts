// Live draft math (PRD DB-1 to DB-6). Pure: the board, the picks API and the
// tests share it.

import { LOWER_IS_BETTER, ROSTER_POSITIONS, type Category, type LeagueSettings, type RosterPosition } from "./league";
import type { PoolPlayer, RankedPlayer } from "./valuation";

export interface DraftPick {
  overall_pick: number;
  team_slot: number;
  player_name: string;
}

/** Draft slot (1-based) picking at `overallPick` in a snake draft. */
export function teamOnClock(overallPick: number, teamCount: number): number {
  const indexInRound = (overallPick - 1) % teamCount;
  return roundOf(overallPick, teamCount) % 2 === 1 ? indexInRound + 1 : teamCount - indexInRound;
}

export function roundOf(overallPick: number, teamCount: number): number {
  return Math.ceil(overallPick / teamCount);
}

/** The first overall pick after `afterPick` that belongs to `slot`. */
export function nextPickFor(slot: number, afterPick: number, teamCount: number): number {
  let pick = afterPick + 1;
  while (teamOnClock(pick, teamCount) !== slot) pick++;
  return pick;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf =
    1 -
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Chance a player is still on the board at overall pick `atPick`, from his ADP
 * mean and deviation. With no deviation from the source, s = max(2, 0.2 × ADP).
 * The PRD writes this as 1 − Φ((p + n − a) / s); p + n is `atPick`.
 */
export function pAvailable(adp: number | null, adpStd: number | null, atPick: number): number | null {
  if (adp == null) return null;
  const s = adpStd ?? Math.max(2, 0.2 * adp);
  return 1 - normalCdf((atPick - adp) / s);
}

/** Undo: drop only the highest overall pick. */
export function withoutLastPick<T extends DraftPick>(picks: T[]): T[] {
  if (picks.length === 0) return picks;
  const last = Math.max(...picks.map((p) => p.overall_pick));
  return picks.filter((p) => p.overall_pick !== last);
}

// Most specific slots first, so a PG fills PG before G before UTIL.
const FILL_ORDER: RosterPosition[] = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BENCH"];
const ELIGIBLE: Partial<Record<RosterPosition, string[]>> = {
  PG: ["PG"],
  SG: ["SG"],
  SF: ["SF"],
  PF: ["PF"],
  C: ["C"],
  G: ["PG", "SG"],
  F: ["SF", "PF"],
  // UTIL and BENCH take anyone
};

/**
 * Open roster slots after placing `players` (DB-6). Each player takes the
 * most specific open slot he's eligible for.
 */
// ponytail: greedy, not a full matching; can misplace multi-position players
// (rare: BBRef lists one position per team). Bipartite matching if it matters.
export function openSlots(
  slots: LeagueSettings["rosterSlots"],
  players: { positions: string[] }[],
): Record<RosterPosition, number> {
  const open = { ...slots };
  for (const p of players) {
    const slot = FILL_ORDER.find((s) => open[s] > 0 && (!ELIGIBLE[s] || ELIGIBLE[s]!.some((pos) => p.positions.includes(pos))));
    if (slot) open[slot]--;
  }
  return Object.fromEntries(ROSTER_POSITIONS.map((s) => [s, open[s]])) as Record<RosterPosition, number>;
}

/**
 * Average per-game z-score of the user's picks in each category (DB-5). The
 * league average for a rostered player is 0 by construction.
 */
export function categoryProfile(mine: RankedPlayer[], categories: Category[]): Partial<Record<Category, number>> {
  const profile: Partial<Record<Category, number>> = {};
  for (const c of categories) {
    profile[c] = mine.length ? mine.reduce((s, r) => s + (r.z[c] ?? 0), 0) / mine.length : 0;
  }
  return profile;
}

// Slots a player has to be eligible for; UTIL and BENCH take anyone, so they
// don't count as a need.
const REQUIRED_SLOTS: RosterPosition[] = ["PG", "SG", "SF", "PF", "C", "G", "F"];
const NEED_BONUS = 0.5;
const SUGGESTION_POOL = 60; // only the best-valued available players are worth scoring
const NOTABLE_BONUS = 0.5; // a bonus this big becomes the stated reason

export interface Suggestion {
  ranked: RankedPlayer;
  score: number;
  reason: string;
}

/**
 * Top suggested picks (DB-8): value + 0.5 per open required slot the player
 * fits + urgency, where urgency = value × chance he's gone by `oddsPick`.
 * Slots, not slot types: two open C spots count as much as PG + G.
 *
 * The reason names the term that set the player apart: urgency, or need
 * beyond what the typical candidate gets (early on every slot is open, so
 * need alone says nothing), else value.
 */
export function suggestPicks(
  available: RankedPlayer[],
  open: Record<RosterPosition, number>,
  oddsPick: number | null,
  count = 3,
): Suggestion[] {
  const scored = available.slice(0, SUGGESTION_POOL).map((r) => {
    const fits = REQUIRED_SLOTS.filter((s) => open[s] > 0 && ELIGIBLE[s]!.some((p) => r.player.positions.includes(p)));
    const need = NEED_BONUS * fits.reduce((n, s) => n + open[s], 0);
    const lasts = oddsPick ? pAvailable(r.player.adp, null, oddsPick) : null;
    const urgency = lasts == null ? 0 : Math.max(0, r.value) * (1 - lasts);
    return { r, fits, need, lasts, urgency };
  });
  const needs = scored.map((x) => x.need).sort((a, b) => a - b);
  const typicalNeed = needs.length ? needs[Math.floor(needs.length / 2)] : 0;

  return scored
    .map(({ r, fits, need, lasts, urgency }) => {
      const needEdge = need - typicalNeed;
      const reason =
        Math.max(needEdge, urgency) < NOTABLE_BONUS
          ? `Best value left (${r.value.toFixed(2)})`
          : urgency >= needEdge
            ? lasts! < 0.5
              ? `Likely gone: ${Math.round(lasts! * 100)}% chance he lasts to your next pick`
              : `${Math.round((1 - lasts!) * 100)}% chance he's gone by your next pick`
            : `Fills your open ${fits.join(", ")}`;
      return { ranked: r, score: r.value + need + urgency, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/**
 * Each ranked player's ADP rank among the ranked players only. Raw ESPN ADP
 * also counts rookies we can't rank, which pushes every veteran's ADP later
 * than his value rank and would flag most of the board as "value".
 */
export function adpRanks(ranked: RankedPlayer[]): Map<string, number> {
  const withAdp = ranked.filter((r) => r.player.adp != null).sort((a, b) => a.player.adp! - b.player.adp!);
  return new Map(withAdp.map((r, i) => [r.player.name, i + 1]));
}

/**
 * DB-9: "value" when our rank beats the ADP rank (see adpRanks) by two rounds
 * or half the ADP rank, whichever is more; "reach" when ADP beats ours. Our
 * values and ESPN's ADP disagree a lot (availability discount, 9-cat vs
 * ESPN's default scoring), so a one-round margin flagged two-thirds of the board.
 */
export function adpFlag(rank: number, adp: number | null, teamCount: number): "value" | "reach" | null {
  if (adp == null) return null;
  const margin = Math.max(2 * teamCount, 0.5 * adp);
  if (adp - rank >= margin) return "value";
  if (rank - adp >= margin) return "reach";
  return null;
}

export interface CategoryRank {
  category: Category;
  /** 1 = best in the draft. */
  rank: number;
  /** Per-game total (counting) or team percentage (FG%, FT%). */
  total: number;
}

function teamTotal(players: PoolPlayer[], c: Category): number {
  const sum = (f: (p: PoolPlayer) => number) => players.reduce((s, p) => s + f(p), 0);
  switch (c) {
    case "PTS": return sum((p) => p.pts);
    case "REB": return sum((p) => p.reb);
    case "AST": return sum((p) => p.ast);
    case "STL": return sum((p) => p.stl);
    case "BLK": return sum((p) => p.blk);
    case "3PM": return sum((p) => p.three_pm);
    case "TO": return sum((p) => p.tov);
    case "FG%": { const a = sum((p) => p.fga); return a ? sum((p) => p.fgm) / a : 0; }
    case "FT%": { const a = sum((p) => p.fta); return a ? sum((p) => p.ftm) / a : 0; }
  }
}

/**
 * RH-3: where the user's team ranks in each category against every team in
 * the draft, from last season's per-game stats. `teams[i]` is slot i + 1.
 */
export function categoryRanks(teams: PoolPlayer[][], mySlot: number, categories: Category[]): CategoryRank[] {
  return categories.map((c) => {
    const totals = teams.map((t) => teamTotal(t, c));
    const mine = totals[mySlot - 1];
    const lowerWins = LOWER_IS_BETTER.includes(c);
    const better = totals.filter((t) => (lowerWins ? t < mine : t > mine)).length;
    return { category: c, rank: better + 1, total: mine };
  });
}
