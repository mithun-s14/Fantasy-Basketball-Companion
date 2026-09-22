import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { getEngine } from "@/lib/agent/engines";
import { isJevAllowed, refreshFlags } from "@/lib/agent/config";
import { ACTION_IDS, type ActionId, type AgentStep, type EngineName } from "@/lib/agent/types";

config({ path: ".env.local" });

// Routing eval: runs route() on every case with no tools executed and no LLM
// answer generated. Ignores AGENT_MODE; the Jev cutoff guard still applies
// because the engine comes from getEngine().
//   npm run eval:routing -- --engine jev --limit 10 --concurrency 4
// --ids reruns named cases only, and --merge folds a previous run's other
// results into the report. Together they resume a run that a provider quota
// cut short:
//   npm run eval:routing -- --engine gemini --ids ask-01,ask-02 \
//     --merge evals/results/routing-gemini-<stamp>.json
// --rpm spaces calls out for providers with a request-per-minute quota
// (the Gemini free tier allows 5/min on gemini-2.5-flash).

interface EvalCase {
  id: string;
  message: string;
  rosterFixture: string;
  stepsSoFar: AgentStep[];
  expected: ActionId;
  needs_review: boolean;
}

interface CaseResult extends EvalCase {
  actual: ActionId | null;
  correct: boolean;
  probability: number | null;
  confidence: number | null;
  totalTokens: number | null;
  latencyMs: number;
  error: string | null;
}

const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`;
}

/** Spaces call starts so a provider quota is not tripped. No-op without --rpm. */
function throttle(rpm: number) {
  const gap = rpm > 0 ? 60_000 / rpm : 0;
  let nextStart = 0;
  return async () => {
    if (!gap) return;
    const wait = Math.max(0, nextStart - Date.now());
    nextStart = Date.now() + wait + gap;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  };
}

/** Runs tasks with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

/** Retries throttling errors. Anything else throws on the first try. */
async function withRetry<R>(fn: () => Promise<R>, attempts = 4): Promise<R> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const text = String(err);
      // A daily quota does not come back within a run, so retrying it just
      // burns more of the next window's budget (4 attempts x the engine's own
      // 2 = 8 wasted requests per case). Resume the survivors with --merge.
      // ponytail: matches on message text; switch to the status//details code
      // if Gemini's wording changes.
      const exhausted = /exceeded your current quota|quota exceeded for metric/i.test(text);
      const throttled = !exhausted && /rate ?limit|high demand|overload/i.test(text);
      if (i >= attempts || !throttled) throw err;
      // Gemini reports how long to wait; Jev does not, so back off linearly.
      const suggested = Number(text.match(/retry in ([\d.]+)s/)?.[1]) * 1000;
      await new Promise((r) => setTimeout(r, suggested || 3000 * i));
    }
  }
}

async function main() {
  const engineName = (arg("engine") ?? "rules") as EngineName;
  if (!["jev", "gemini", "rules"].includes(engineName)) {
    console.error("Usage: eval:routing -- --engine jev|gemini|rules [--limit n] [--concurrency 4] [--rpm 5]");
    process.exit(1);
  }
  const limit = Number(arg("limit") ?? Infinity);
  const ids = arg("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
  const mergeFrom = arg("merge");
  const concurrency = Number(arg("concurrency") ?? 4);
  const takeSlot = throttle(Number(arg("rpm") ?? 0));

  const rosters: Record<string, string | null> = JSON.parse(
    readFileSync("evals/roster-fixtures.json", "utf8")
  );
  const cases: EvalCase[] = readFileSync("evals/routing.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((c: EvalCase) => !ids || ids.includes(c.id))
    .slice(0, limit);
  const missing = ids?.filter((id) => !cases.some((c) => c.id === id)) ?? [];
  if (missing.length) {
    console.error(`no such case in evals/routing.jsonl: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Fixtures only, no user data, and ZDR is a Pro-plan feature.
  process.env.JEV_ZDR = "false";

  await refreshFlags();
  if (engineName === "jev" && !isJevAllowed()) {
    console.log("Jev is blocked by the cutoff guard — the fallback engine will answer instead.");
  }
  const engine = getEngine(engineName);
  console.log(`requested: ${engineName}   actual: ${engine.name}   cases: ${cases.length}\n`);

  const results = await pool(cases, concurrency, async (c): Promise<CaseResult> => {
    const state = {
      message: c.message,
      rosterSummary: rosters[c.rosterFixture] ?? undefined,
      steps: c.stepsSoFar,
      stepCount: c.stepsSoFar.length,
    };
    // The engine caps retries at 1 to protect loop latency. The eval has no
    // latency budget, so it retries the provider's transient rate limits.
    try {
      const d = await withRetry(async () => {
        await takeSlot();
        return engine.route(state);
      });
      return {
        ...c,
        actual: d.action,
        correct: d.action === c.expected,
        probability: d.probability,
        confidence: d.confidence,
        totalTokens: d.totalTokens ?? null,
        latencyMs: d.latencyMs,
        error: null,
      };
    } catch (err) {
      return {
        ...c,
        actual: null,
        correct: false,
        probability: null,
        confidence: null,
        totalTokens: null,
        latencyMs: 0,
        error: String(err),
      };
    }
  });

  // A quota can cut a run short, so --merge carries the earlier run's other
  // cases over. This run always wins for any id it covers.
  if (mergeFrom) {
    const prior: CaseResult[] = JSON.parse(readFileSync(mergeFrom, "utf8")).results;
    const ran = new Set(results.map((r) => r.id));
    const carried = prior.filter((r) => !ran.has(r.id));
    results.push(...carried);
    console.log(`merged ${carried.length} case(s) from ${mergeFrom}\n`);
  }

  const reviewed = results.filter((r) => !r.needs_review);
  const correct = results.filter((r) => r.correct).length;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const tokens = results.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

  const perAction = ACTION_IDS.map((action) => {
    const predicted = results.filter((r) => r.actual === action);
    const expected = results.filter((r) => r.expected === action);
    const hits = predicted.filter((r) => r.correct).length;
    return {
      action,
      support: expected.length,
      predicted: predicted.length,
      precision: predicted.length ? hits / predicted.length : null,
      recall: expected.length ? hits / expected.length : null,
    };
  });

  // Rows are the expected action, columns the predicted one.
  const confusion: Record<string, Record<string, number>> = {};
  for (const expected of ACTION_IDS) {
    confusion[expected] = Object.fromEntries(ACTION_IDS.map((a) => [a, 0]));
    confusion[expected].error = 0;
  }
  for (const r of results) confusion[r.expected][r.actual ?? "error"] += 1;

  // How ROUTE_MIN_PROB gets calibrated: at each threshold, what share of cases
  // the engine answers itself and how accurate that share is.
  const withProb = results.filter((r) => r.probability !== null);
  const coverage = THRESHOLDS.map((t) => {
    const above = withProb.filter((r) => (r.probability as number) >= t);
    return {
      threshold: t,
      coverage: withProb.length ? above.length / withProb.length : null,
      accuracy: above.length ? above.filter((r) => r.correct).length / above.length : null,
    };
  });

  const summary = {
    engine: engine.name,
    requestedEngine: engineName,
    ranAt: new Date().toISOString(),
    cases: results.length,
    accuracy: results.length ? correct / results.length : 0,
    reviewedCases: reviewed.length,
    reviewedAccuracy: reviewed.length
      ? reviewed.filter((r) => r.correct).length / reviewed.length
      : null,
    errors: results.filter((r) => r.error).length,
    latencyP50: percentile(latencies, 0.5),
    latencyP95: percentile(latencies, 0.95),
    totalTokens: tokens || null,
    perAction,
    confusion,
    coverage,
  };

  const stamp = summary.ranAt.replace(/[:.]/g, "-");
  const path = `evals/results/routing-${engine.name}-${stamp}.json`;
  writeFileSync(path, JSON.stringify({ summary, results }, null, 2));

  console.log(`accuracy:          ${pct(correct, results.length)} (${correct}/${results.length})`);
  console.log(
    `reviewed accuracy: ${pct(reviewed.filter((r) => r.correct).length, reviewed.length)} (${reviewed.length} reviewed)`
  );
  console.log(`errors:            ${summary.errors}`);
  console.log(`latency p50/p95:   ${summary.latencyP50}ms / ${summary.latencyP95}ms`);
  console.log(`tokens:            ${summary.totalTokens ?? "not reported"}\n`);

  console.log("action                  support  predicted  precision  recall");
  for (const a of perAction) {
    console.log(
      `${a.action.padEnd(22)}  ${String(a.support).padStart(7)}  ${String(a.predicted).padStart(9)}  ` +
        `${(a.precision === null ? "n/a" : a.precision.toFixed(2)).padStart(9)}  ` +
        `${a.recall === null ? "n/a" : a.recall.toFixed(2)}`
    );
  }

  console.log("\nconfusion (rows expected, columns predicted)");
  console.log("".padEnd(22) + [...ACTION_IDS, "error"].map((a) => a.slice(0, 8).padStart(9)).join(""));
  for (const expected of ACTION_IDS) {
    console.log(
      expected.padEnd(22) +
        [...ACTION_IDS, "error"].map((a) => String(confusion[expected][a]).padStart(9)).join("")
    );
  }

  console.log("\nthreshold  coverage  accuracy above");
  for (const c of coverage) {
    console.log(
      `${c.threshold.toFixed(1).padStart(9)}  ${(c.coverage === null ? "n/a" : (100 * c.coverage).toFixed(0) + "%").padStart(8)}  ` +
        `${c.accuracy === null ? "n/a" : (100 * c.accuracy).toFixed(0) + "%"}`
    );
  }
  if (withProb.length === 0) {
    console.log("(this engine reports no probabilities, so there is nothing to calibrate)");
  }

  console.log(`\nwrote ${path}`);
}

main().catch((err) => {
  console.error("eval:routing failed:", err);
  process.exit(1);
});
