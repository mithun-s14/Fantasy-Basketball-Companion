import { Redis } from "@upstash/redis";
import type { EngineName } from "./types";

// Flag resolution order: Redis hash `flags:agent` → env var → default.
// Redis reads are cached in memory for 30s so a chat never waits on a flag read.

export const FLAG_DEFAULTS = {
  AGENT_MODE: "off",
  DECISION_ENGINE: "rules",
  DECISION_ENGINE_ROUTE: "",
  DECISION_ENGINE_VERIFY: "",
  DECISION_FALLBACK: "rules",
  DECISION_SHADOW: "off",
  JEV_CUTOFF: "2026-09-25T00:00:00Z",
  JEV_ALLOW_PAID: "false",
  ROUTE_MIN_PROB: "0.6",
  VERIFY_MIN_PROB: "0.7",
  MAX_AGENT_STEPS: "4",
  AGENT_LOOP_TIMEOUT_MS: "8000",
  LOG_DECISION_STATE: "false",
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;
export const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as FlagKey[];

export const FLAGS_REDIS_KEY = "flags:agent";
const CACHE_TTL_MS = 30_000;
// A slow flag read must never add seconds to a chat. On timeout the last known
// flags are kept and the next request tries again.
const READ_TIMEOUT_MS = 300;

let overrides: Partial<Record<FlagKey, string>> = {};
let overridesReadAt = -Infinity;

let redis: Redis | null | undefined;
/** Shared Upstash client for flags and tool caching. Null when Upstash is unconfigured. */
export function getRedis(): Redis | null {
  if (redis === undefined) {
    try {
      redis = Redis.fromEnv();
    } catch {
      redis = null; // no Upstash env — env vars and defaults still work
    }
  }
  return redis;
}

/**
 * Refresh the Redis override cache if it is older than 30s. Call once per
 * request before reading config; getConfig() itself stays synchronous.
 */
export async function refreshFlags(now: number = Date.now()): Promise<void> {
  if (now - overridesReadAt < CACHE_TTL_MS) return;
  const client = getRedis();
  if (!client) {
    overridesReadAt = now;
    return;
  }
  try {
    const hash = await Promise.race([
      client.hgetall<Record<string, string>>(FLAGS_REDIS_KEY),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("flag read timed out")), READ_TIMEOUT_MS)
      ),
    ]);
    const next: Partial<Record<FlagKey, string>> = {};
    for (const key of FLAG_KEYS) {
      const value = hash?.[key];
      if (value !== undefined && value !== null && String(value) !== "") {
        next[key] = String(value);
      }
    }
    overrides = next;
    overridesReadAt = now;
  } catch (err) {
    // Redis unavailable — keep the last known overrides and carry on
    console.warn("[agent] flag refresh failed:", err);
  }
}

/** Test seam: drops the cached overrides and the memoized Redis client. */
export function resetFlagCache(): void {
  overrides = {};
  overridesReadAt = -Infinity;
  redis = undefined;
}

function raw(key: FlagKey): string {
  return overrides[key] ?? process.env[key] ?? FLAG_DEFAULTS[key];
}

const ENGINE_NAMES: EngineName[] = ["jev", "gemini", "rules"];

function engine(key: FlagKey, fallback: EngineName): EngineName {
  const value = raw(key);
  return (ENGINE_NAMES as string[]).includes(value)
    ? (value as EngineName)
    : fallback;
}

function num(key: FlagKey): number {
  const value = Number(raw(key));
  return Number.isFinite(value) ? value : Number(FLAG_DEFAULTS[key]);
}

export interface AgentConfig {
  agentMode: "on" | "off";
  routeEngine: EngineName;
  verifyEngine: EngineName | "off";
  fallbackEngine: EngineName;
  shadowEngine: EngineName | "off";
  jevCutoff: string;
  jevAllowPaid: boolean;
  routeMinProb: number;
  verifyMinProb: number;
  maxAgentSteps: number;
  loopTimeoutMs: number;
  logDecisionState: boolean;
}

export function getConfig(): AgentConfig {
  const base = engine("DECISION_ENGINE", "rules");
  return {
    agentMode: raw("AGENT_MODE") === "on" ? "on" : "off",
    routeEngine: engine("DECISION_ENGINE_ROUTE", base),
    verifyEngine:
      raw("DECISION_ENGINE_VERIFY") === "off"
        ? "off"
        : engine("DECISION_ENGINE_VERIFY", base),
    // gemini and rules only — jev is never a fallback, it is what we fall back from
    fallbackEngine: raw("DECISION_FALLBACK") === "gemini" ? "gemini" : "rules",
    shadowEngine:
      raw("DECISION_SHADOW") === "off"
        ? "off"
        : engine("DECISION_SHADOW", "rules"),
    jevCutoff: raw("JEV_CUTOFF"),
    jevAllowPaid: raw("JEV_ALLOW_PAID") === "true",
    routeMinProb: num("ROUTE_MIN_PROB"),
    verifyMinProb: num("VERIFY_MIN_PROB"),
    maxAgentSteps: num("MAX_AGENT_STEPS"),
    loopTimeoutMs: num("AGENT_LOOP_TIMEOUT_MS"),
    logDecisionState: raw("LOG_DECISION_STATE") === "true",
  };
}

/**
 * The only gate on Jev spend. Every Jev call path goes through this, including
 * shadow mode, agent:ping, and the eval harness.
 */
export function isJevAllowed(now: Date = new Date()): boolean {
  if (getConfig().jevAllowPaid) return true;
  if (!process.env.AI_GATEWAY_API_KEY) return false;
  return now < new Date(getConfig().jevCutoff);
}
