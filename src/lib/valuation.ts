// Draft Assistant valuation (PRD "Valuation model"). Pure and synchronous so
// punt toggles recompute on the client.

import { LOWER_IS_BETTER, type Category } from "./league";

export interface PoolPlayer {
  name: string;
  team: string;
  positions: string[];
  /** Games played in the stat season. */
  gp: number;
  /** Games over the availability window: the stat season plus the one before. */
  gpWindow: number;
  /** Seasons in that window the player has stats for (1 for last year's rookies). */
  seasonsInWindow: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  three_pm: number;
  tov: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  adp: number | null;
}

export interface RankedPlayer {
  player: PoolPlayer;
  /** Z-score per active category; TO already sign-flipped so higher is better. */
  z: Partial<Record<Category, number>>;
  /** Per-game value over replacement, before the availability discount. */
  perGameValue: number;
  /** Fraction of possible games played over the window, capped at 1. */
  availability: number;
  /** perGameValue × availability (when positive). What the board sorts by. */
  value: number;
  rank: number;
  tier: number;
  /** Under MIN_GP: ranked, but left out of the league averages. */
  lowGp: boolean;
}

export interface RankOptions {
  teamCount: number;
  rosterSize: number;
  categories: Category[];
  punts?: Category[];
}

export const MIN_GP = 20;
export const GAMES_PER_SEASON = 82;
const REPLACEMENT_WINDOW = 10;
// A new tier starts where the drop to the next player is over 7% of the value
// above it. The PRD's 1.5 × median-gap rule made 63 tiers in a 12-team top 156
// on real data: values bunch up mid-board, so the median gap is tiny.
const TIER_RELATIVE_GAP = 0.07;
const TIER_VALUE_FLOOR = 0.5; // keeps the ratio sane near replacement level (value 0)
const MAX_TIER_SIZE = 12;

const COUNTING: Partial<Record<Category, (p: PoolPlayer) => number>> = {
  PTS: (p) => p.pts,
  REB: (p) => p.reb,
  AST: (p) => p.ast,
  STL: (p) => p.stl,
  BLK: (p) => p.blk,
  "3PM": (p) => p.three_pm,
  TO: (p) => p.tov,
};

interface Model {
  categories: Category[];
  fgPct: number;
  ftPct: number;
  mean: Partial<Record<Category, number>>;
  sd: Partial<Record<Category, number>>;
}

/** The number a category is z-scored on. Percentages become volume-weighted impact. */
function raw(p: PoolPlayer, c: Category, m: Pick<Model, "fgPct" | "ftPct">): number {
  // (makes / attempts - league%) × attempts, written so 0 attempts gives 0.
  if (c === "FG%") return p.fgm - m.fgPct * p.fga;
  if (c === "FT%") return p.ftm - m.ftPct * p.fta;
  return COUNTING[c]!(p);
}

function buildModel(pool: PoolPlayer[], categories: Category[]): Model {
  const sum = (f: (p: PoolPlayer) => number) => pool.reduce((s, p) => s + f(p), 0);
  const fga = sum((p) => p.fga);
  const fta = sum((p) => p.fta);
  const m: Model = {
    categories,
    fgPct: fga > 0 ? sum((p) => p.fgm) / fga : 0,
    ftPct: fta > 0 ? sum((p) => p.ftm) / fta : 0,
    mean: {},
    sd: {},
  };
  for (const c of categories) {
    const xs = pool.map((p) => raw(p, c, m));
    const mean = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
    // Population SD: the pool is the whole set of rosterable players, not a sample.
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length || 1));
    m.mean[c] = mean;
    m.sd[c] = sd;
  }
  return m;
}

function score(p: PoolPlayer, m: Model) {
  const z: Partial<Record<Category, number>> = {};
  let total = 0;
  for (const c of m.categories) {
    const sd = m.sd[c]!;
    const sign = LOWER_IS_BETTER.includes(c) ? -1 : 1;
    z[c] = sd > 0 ? (sign * (raw(p, c, m) - m.mean[c]!)) / sd : 0;
    total += z[c]!;
  }
  return { z, total };
}

export function availability(p: PoolPlayer): number {
  // ponytail: a player who missed the whole earlier season counts as one season
  // of data, so a lost year isn't penalized; per-season GP rows would fix that.
  const possible = GAMES_PER_SEASON * Math.max(1, p.seasonsInWindow);
  return Math.min(1, p.gpWindow / possible);
}

/** Tier number per position in a list sorted by value, best first. */
export function assignTiers(values: number[]): number[] {
  const tiers: number[] = [];
  let tier = 1;
  let size = 0;
  values.forEach((v, i) => {
    const above = values[i - 1];
    const bigDrop = i > 0 && (above - v) / Math.max(Math.abs(above), TIER_VALUE_FLOOR) > TIER_RELATIVE_GAP;
    if (bigDrop || size === MAX_TIER_SIZE) {
      tier++;
      size = 0;
    }
    tiers.push(tier);
    size++;
  });
  return tiers;
}

/**
 * Ranks the pool for a league: z-score sum over the non-punted categories,
 * league averages from the top teams × roster spots, value over replacement,
 * discounted by availability, then tiered.
 */
export function rankPlayers(pool: PoolPlayer[], opts: RankOptions): RankedPlayer[] {
  const punts = opts.punts ?? [];
  const active = opts.categories.filter((c) => !punts.includes(c));
  const n = opts.teamCount * opts.rosterSize;

  // Two passes: averages over every player with enough games, then over the
  // top n of those, so deep-bench players don't drag the averages down.
  const eligible = pool.filter((p) => p.gp >= MIN_GP);
  const first = buildModel(eligible, active);
  const topN = eligible
    .map((p) => ({ p, v: score(p, first).total }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.p);
  const model = buildModel(topN, active);

  const scored = pool
    .map((p) => ({ p, ...score(p, model) }))
    .sort((a, b) => b.total - a.total);
  const tail = scored.slice(n, n + REPLACEMENT_WINDOW);
  const replacement = tail.length ? tail.reduce((s, x) => s + x.total, 0) / tail.length : 0;

  const ranked = scored
    .map(({ p, z, total }) => {
      const perGameValue = total - replacement;
      const avail = availability(p);
      // Discount only value above replacement: scaling a negative value toward 0
      // would rank an often-injured bench player above a healthy one.
      const value = perGameValue > 0 ? perGameValue * avail : perGameValue;
      return { player: p, z, perGameValue, availability: avail, value, lowGp: p.gp < MIN_GP };
    })
    .sort((a, b) => b.value - a.value);

  const tiers = assignTiers(ranked.map((r) => r.value));
  return ranked.map((r, i) => ({ ...r, rank: i + 1, tier: tiers[i] }));
}
