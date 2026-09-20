import type { SupabaseClient } from "@supabase/supabase-js";
import { getRedis } from "./config";
import type { PlayerRef } from "./args";
import type { PlayerStats, RosterPlayer } from "../types";

// Every tool returns a short string summary. State stays well inside Jev's
// 32K context window, so summaries are capped at about 2KB.

const MAX_SUMMARY_CHARS = 2000;

export const TOOL_TTL_SECONDS = {
  get_roster: 60,
  get_recent_performance: 3600,
} as const;

function cap(summary: string): string {
  return summary.length <= MAX_SUMMARY_CHARS
    ? summary
    : `${summary.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

/** Redis-cached tool result. A cache failure just means the tool runs again. */
async function cached<T>(key: string, ttlSeconds: number, run: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get<T>(key);
      if (hit != null) return hit;
    } catch (err) {
      console.warn("[agent] tool cache read failed:", err);
    }
  }

  const result = await run();

  if (redis) {
    try {
      await redis.set(key, result, { ex: ttlSeconds });
    } catch (err) {
      console.warn("[agent] tool cache write failed:", err);
    }
  }
  return result;
}

/**
 * The user's roster, read through their own session client so RLS still
 * applies. Never the service role.
 */
export async function getRoster(
  supabase: SupabaseClient,
  userId: string
): Promise<{ summary: string; players: PlayerRef[] }> {
  const { data, error } = await supabase
    .from("roster_players")
    .select("player_name, nba_team")
    .eq("user_id", userId);

  if (error) throw new Error(`get_roster failed: ${error.message}`);

  const players = (data ?? []).map((row: Pick<RosterPlayer, "player_name" | "nba_team">) => ({
    name: row.player_name,
    team: row.nba_team,
  }));

  const summary = players.length
    ? `The user's roster (${players.length} players): ${players
        .map((p) => `${p.name} (${p.team})`)
        .join(", ")}.`
    : "The user has no players saved on their roster.";

  return { summary: cap(summary), players };
}

export async function getRosterCached(
  supabase: SupabaseClient,
  userId: string
): Promise<{ summary: string; players: PlayerRef[] }> {
  return cached(`agent:roster:${userId}`, TOOL_TTL_SECONDS.get_roster, () =>
    getRoster(supabase, userId)
  );
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pct(made: number, attempted: number): string {
  return attempted > 0 ? `${((made / attempted) * 100).toFixed(1)}%` : "n/a";
}

function line(label: string, s: PlayerStats): string {
  return `${label} ${fmt(s.pts)}p/${fmt(s.reb)}r/${fmt(s.ast)}a, ${fmt(s.stl)}s/${fmt(
    s.blk
  )}b/${fmt(s.three_pm)}×3, ${fmt(s.tov)}to, FG ${pct(s.fgm, s.fga)}, FT ${pct(
    s.ftm,
    s.fta
  )}`;
}

/**
 * Recent form for the named players. The app stores season and last-10
 * aggregates, not per-game logs, so "recent" means last 10 versus season.
 */
export async function getRecentPerformance(
  supabase: SupabaseClient,
  players: PlayerRef[]
): Promise<string> {
  if (players.length === 0) return "No players were named, so no stats were looked up.";

  const names = players.map((p) => p.name);
  const { data, error } = await supabase
    .from("player_stats")
    .select("*")
    .in("player_name", names);

  if (error) throw new Error(`get_recent_performance failed: ${error.message}`);

  const rows = (data ?? []) as PlayerStats[];
  const parts: string[] = [];

  for (const player of players) {
    const forPlayer = rows.filter(
      (r) => r.player_name.normalize("NFC").toLowerCase() === player.name.normalize("NFC").toLowerCase()
    );
    const last10 = forPlayer.find((r) => r.stat_type === "last10");
    const season = forPlayer.find((r) => r.stat_type === "season");

    if (!last10 && !season) {
      parts.push(`${player.name} (${player.team}): no stats on file.`);
      continue;
    }
    const segments = [`${player.name} (${player.team}):`];
    if (last10) segments.push(line("last 10", last10));
    if (season) segments.push(line("season", season));
    parts.push(segments.join(" "));
  }

  return cap(parts.join("\n"));
}

export async function getRecentPerformanceCached(
  supabase: SupabaseClient,
  players: PlayerRef[]
): Promise<string> {
  const key = `agent:perf:${players.map((p) => p.name).sort().join("|")}`;
  return cached(key, TOOL_TTL_SECONDS.get_recent_performance, () =>
    getRecentPerformance(supabase, players)
  );
}
