import { headers } from "next/headers";
import { PageHeader } from "@/components/PageHeader";

// ponytail: hand-kept list; update when a tool is added to src/nfl/mcp.ts.
const TOOLS = [
  {
    name: "get_kicker_streamers",
    args: "week (1–18, default current), basis (season_avg | last3 | prev_season_avg)",
    desc: "Per-kicker matchup stats: team FG attempts/game, opponent FG made allowed, red zone TD rates, Vegas implied total, home/indoor and weather.",
  },
  {
    name: "get_dst_stats",
    args: "scoring (espn_default | sleeper_default | yahoo_default), team (e.g. BAL)",
    desc: "Every D/ST matchup for the latest published week: Vegas lines, opposing QB and offense, the defense's own rates and fantasy points, game context and flags.",
  },
  {
    name: "get_coverage_schemes",
    args: "team (name substring)",
    desc: "Man, zone, middle open/closed, blitz, light/heavy box and sub package rates by defense.",
  },
];

const PROMPTS = [
  "Which kickers have the best matchups this week?",
  "Compare the D/ST options for BAL and KC under Sleeper scoring.",
  "Which defenses play the most man coverage?",
];

const card = "rounded-lg border border-border bg-card p-5";

export default async function McpPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/nfl/mcp`;

  return (
    <div className="w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader />

      <section className={card}>
        <h2 className="font-semibold">Server URL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only, no sign-in needed. Rate limited to 60 requests a minute per IP.
        </p>
        <code className="mt-3 block overflow-x-auto rounded bg-muted px-3 py-2 text-sm">{url}</code>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Connect</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          <li>
            <span className="font-medium">Claude:</span> Settings → Connectors → Add custom connector, paste the URL.
          </li>
          <li>
            <span className="font-medium">ChatGPT:</span> Settings → Connectors (developer mode) → Create, paste the URL, no auth.
          </li>
          <li>
            <span className="font-medium">Claude Code:</span>
            <code className="mt-1 block overflow-x-auto rounded bg-muted px-3 py-2">
              claude mcp add --transport http nfl-streamers {url}
            </code>
          </li>
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Tools</h2>
        <div className="mt-3 space-y-4">
          {TOOLS.map((t) => (
            <div key={t.name}>
              <code className="text-sm font-semibold text-primary">{t.name}</code>
              <p className="text-sm">{t.desc}</p>
              <p className="text-xs text-muted-foreground">Optional: {t.args}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Tools return raw stats with no combined score, so the model weighs them itself.
        </p>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Try asking</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {PROMPTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
