import { config } from "dotenv";
import { Redis } from "@upstash/redis";
import { FLAG_DEFAULTS, FLAG_KEYS, FLAGS_REDIS_KEY, type FlagKey } from "@/lib/agent/config";

config({ path: ".env.local" });

// Instant kill switch: Redis overrides beat env vars with no redeploy.
//   npm run flags:get
//   npm run flags:set -- DECISION_ENGINE rules
//   npm run flags:set -- DECISION_ENGINE --clear

const redis = Redis.fromEnv();

function isFlagKey(value: string): value is FlagKey {
  return (FLAG_KEYS as string[]).includes(value);
}

async function get() {
  const hash = await redis.hgetall<Record<string, string>>(FLAGS_REDIS_KEY);
  for (const key of FLAG_KEYS) {
    const override = hash?.[key];
    const source = override != null && override !== ""
      ? "redis"
      : process.env[key]
        ? "env"
        : "default";
    const value = override ?? process.env[key] ?? FLAG_DEFAULTS[key];
    console.log(`${key.padEnd(24)} ${String(value || "(inherits)").padEnd(26)} ${source}`);
  }
}

async function set(key: string, value: string | undefined) {
  if (!isFlagKey(key)) {
    console.error(`Unknown flag "${key}". Known flags:\n  ${FLAG_KEYS.join("\n  ")}`);
    process.exit(1);
  }
  if (value === "--clear" || value === undefined) {
    await redis.hdel(FLAGS_REDIS_KEY, key);
    console.log(`Cleared ${key} — falls back to env or default.`);
    return;
  }
  await redis.hset(FLAGS_REDIS_KEY, { [key]: value });
  console.log(`Set ${key}=${value}. Takes effect within 30s.`);
}

async function main() {
  const [command, key, value] = process.argv.slice(2);
  if (command === "get") {
    await get();
  } else if (command === "set") {
    await set(key, value);
  } else {
    console.error("Usage: flags.ts get | flags.ts set <KEY> <value|--clear>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("flags failed:", err);
  process.exit(1);
});
