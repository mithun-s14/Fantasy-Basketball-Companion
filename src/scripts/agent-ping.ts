import { config } from "dotenv";
import { getEngine } from "@/lib/agent/engines";
import { isJevAllowed, refreshFlags } from "@/lib/agent/config";
import type { AgentState, EngineName } from "@/lib/agent/types";

config({ path: ".env.local" });

// One route call on a fixed state, so each engine can be smoke-tested by hand.
//   npm run agent:ping -- --engine jev

const SAMPLE_STATE: AgentState = {
  message: "Should I start Jalen Green this week or stream someone with more games?",
  rosterSummary: "Jalen Green (Houston Rockets), Alperen Sengun (Houston Rockets)",
  steps: [],
  stepCount: 0,
};

async function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--engine");
  const requested = (flagIndex >= 0 ? args[flagIndex + 1] : "rules") as EngineName;

  if (!["jev", "gemini", "rules"].includes(requested)) {
    console.error("Usage: agent:ping -- --engine jev|gemini|rules");
    process.exit(1);
  }

  await refreshFlags();

  if (requested === "jev" && !isJevAllowed()) {
    console.log("Jev is blocked by the cutoff guard — the fallback engine will answer.");
  }

  const engine = getEngine(requested);
  console.log(`requested: ${requested}   actual: ${engine.name}`);
  console.log(`state: ${JSON.stringify(SAMPLE_STATE.message)}`);

  const decision = await engine.route(SAMPLE_STATE);
  console.log(`action:      ${decision.action}`);
  console.log(`probability: ${decision.probability ?? "n/a"}`);
  console.log(`confidence:  ${decision.confidence ?? "n/a"}`);
  console.log(`latency:     ${decision.latencyMs}ms`);
}

main().catch((err) => {
  console.error("agent:ping failed:", err);
  process.exit(1);
});
