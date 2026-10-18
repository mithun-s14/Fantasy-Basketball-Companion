import { readFileSync } from "node:fs";
import path from "node:path";
import { createServerSupabaseClient } from "./supabase";
import { currentSeason, playerNameKey, previousSeason } from "./constants";
import { cached } from "./agent/tools";
import type { PoolPlayer } from "./valuation";

const POOL_TTL_SECONDS = 60 * 60; // stats change at most daily
const ADP_SOURCE = "espn";
const MAX_ROWS = 2000; // Supabase returns 1000 rows unless asked for more
const DAY_MS = 24 * 60 * 60 * 1000;
// RotoBaller 9-cat projected rankings, checked in by hand. Shown beside ADP as a
// second opinion; not part of our valuation (it has no attempts or GP).
const ROTOBALLER_CSV = path.join(process.cwd(), "public", "rotoballer-nba-Overall-9cat-proj-rankings.csv");

/**
 * The season being drafted. Drafts run August to October, before the
 * season's October tip-off, so look three months ahead.
 */
export function upcomingDraftSeason(now = new Date()): string {
  return currentSeason(new Date(now.getTime() + 92 * DAY_MS));
}

/** An active player with no stats last season (rookies, players who sat out). Draftable, not ranked. */
export interface UnrankedPlayer {
  name: string;
  team: string;
  positions: string[];
  adp: number | null;
}

export interface DraftPool {
  /** Season being drafted, e.g. 2026-27. ADP is for this season. */
  draftSeason: string;
  /** Season the per-game stats come from: the one before. */
  statSeason: string;
  players: PoolPlayer[];
  unranked: UnrankedPlayer[];
  /** RotoBaller overall rank and tier by nba_players name. */
  rotoballer: Record<string, { rank: number; tier: number }>;
}

// RotoBaller spelling → nba_players spelling, where playerNameKey alone misses.
const ROTOBALLER_ALIASES: Record<string, string> = {
  "Nicolas Claxton": "Nic Claxton",
  "Ron Holland II": "Ronald Holland II",
};

/** Name key → RotoBaller rank/tier. Columns: Rank,Player,...,Tier (last). */
function loadRotoballer(): Map<string, { rank: number; tier: number }> {
  const lines = readFileSync(ROTOBALLER_CSV, "utf8").trim().split(/\r?\n/).slice(1);
  return new Map(
    lines.map((line) => {
      const cols = line.split(","); // no quoted fields in this file
      return [playerNameKey(ROTOBALLER_ALIASES[cols[1]] ?? cols[1]), { rank: Number(cols[0]), tier: Number(cols[cols.length - 1]) }];
    }),
  );
}

/**
 * Every active player (in nba_players) with stats for the season before
 * `draftSeason`, joined with positions, two-season games played and ADP.
 * Names join directly: the ingest scripts store nba_players spellings.
 */
async function loadPool(draftSeason: string): Promise<DraftPool> {
  const statSeason = previousSeason(draftSeason);
  const supabase = createServerSupabaseClient();

  const [stats, earlier, players, adp] = await Promise.all([
    supabase
      .from("player_stats")
      .select("player_name, nba_team, gp, pts, reb, ast, stl, blk, three_pm, tov, fgm, fga, ftm, fta")
      .eq("season", statSeason)
      .eq("stat_type", "season")
      .range(0, MAX_ROWS - 1),
    supabase
      .from("player_stats")
      .select("player_name, gp")
      .eq("season", previousSeason(statSeason))
      .eq("stat_type", "season")
      .range(0, MAX_ROWS - 1),
    supabase.from("nba_players").select("name, team, positions").range(0, MAX_ROWS - 1),
    supabase
      .from("player_adp")
      .select("player_name, adp")
      .eq("season", draftSeason)
      .eq("source", ADP_SOURCE)
      .range(0, MAX_ROWS - 1),
  ]);
  for (const { error } of [stats, earlier, players, adp]) {
    if (error) throw new Error(`Draft pool query failed: ${error.message}`);
  }

  const active = new Map(players.data!.map((p) => [p.name as string, p]));
  const earlierGp = new Map(earlier.data!.map((r) => [r.player_name as string, (r.gp as number | null) ?? 0]));
  const adpByName = new Map(adp.data!.map((r) => [r.player_name as string, r.adp as number]));

  const pool: PoolPlayer[] = [];
  for (const s of stats.data!) {
    const current = active.get(s.player_name);
    if (!current) continue; // retired or unsigned
    const gp = s.gp ?? 0;
    pool.push({
      name: s.player_name,
      team: current.team,
      positions: current.positions ?? [],
      gp,
      gpWindow: gp + (earlierGp.get(s.player_name) ?? 0),
      seasonsInWindow: earlierGp.has(s.player_name) ? 2 : 1,
      pts: s.pts,
      reb: s.reb,
      ast: s.ast,
      stl: s.stl,
      blk: s.blk,
      three_pm: s.three_pm,
      tov: s.tov,
      fgm: s.fgm,
      fga: s.fga,
      ftm: s.ftm,
      fta: s.fta,
      adp: adpByName.get(s.player_name) ?? null,
    });
  }
  const ranked = new Set(pool.map((p) => p.name));
  const unranked = players
    .data!.filter((p) => !ranked.has(p.name))
    .map((p) => ({ name: p.name, team: p.team, positions: p.positions ?? [], adp: adpByName.get(p.name) ?? null }));
  const rb = loadRotoballer();
  const rotoballer: DraftPool["rotoballer"] = {};
  for (const p of players.data!) {
    const r = rb.get(playerNameKey(p.name));
    if (r) rotoballer[p.name] = r;
  }
  return { draftSeason, statSeason, players: pool, unranked, rotoballer };
}

export function getDraftPool(draftSeason: string): Promise<DraftPool> {
  return cached(`draft:pool:v3:${draftSeason}`, POOL_TTL_SECONDS, () => loadPool(draftSeason));
}
