# Fantasy Basketball Companion

A full-stack web app for fantasy basketball players. Analyze NBA schedules, manage your roster, and get personalized advice from an AI coach.

## Features

- **Schedule Analyzer** — Pick any date range and instantly see how many games each NBA team plays. Color-coded by volume to surface streaming targets and back-to-back situations.
- **AI Coach** — Chat with a Gemini-powered assistant for trade advice, waiver wire recommendations, and lineup decisions. If you're signed in with a saved roster, the AI uses it as context for personalized answers. Requests are rate-limited per IP via a Redis-backed sliding window (3 req/min) enforced globally across all serverless instances.
- **Roster Management** — Add and remove active NBA players from your fantasy team. Player names are validated against the live NBA roster (pulled from the NBA Stats API and stored in Supabase). Supports accented names (Jokić, Vučević, etc.).
- **Matchup Analysis** - Determine whether or not you can win this week's matchup by comparing your roster against your opponents. Statistics scraped from Basketball Reference.
- **Auth** — Email/password sign-up and login via Supabase Auth and Google OAuth2. The Roster page is protected; the Schedule Analyzer and AI Coach are public.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database & Auth | Supabase (PostgreSQL + Supabase Auth) |
| AI | Google Gemini (`gemini-2.5-flash`) via `@google/generative-ai` |
| Rate Limiting | Upstash Redis (sliding window, HTTP-compatible with serverless) |
| UI | shadcn/ui + Tailwind CSS |
| Deployment | Vercel |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # POST — streams Gemini AI responses
│   │   ├── games/route.ts      # GET  — game counts for a date range
│   │   └── players/route.ts    # GET  — player autocomplete search
│   ├── analyzer/page.tsx       # Schedule Analyzer page
│   ├── auth/
│   │   ├── actions.ts          # Server Actions: login, signup, logout
│   │   └── page.tsx            # Login / sign-up page
│   ├── chat/page.tsx           # AI Coach chat page
│   ├── roster/
│   │   ├── actions.ts          # Server Actions: addPlayer, removePlayer
│   │   └── page.tsx            # Roster page (protected)
│   ├── layout.tsx              # Root layout — mounts global Navbar
│   └── page.tsx                # Landing page
├── components/
│   ├── ui/                     # shadcn/ui primitives (do not edit directly)
│   ├── AuthButton.tsx          # Login link or email + logout button
│   ├── Navbar.tsx              # Global nav (server component, reads auth)
│   ├── RosterClient.tsx        # Roster add/remove UI
│   ├── ScheduleAnalyzer.tsx    # Schedule picker + results table
│   └── TeamScheduleTable.tsx   # Color-coded game count table
├── lib/
│   ├── constants.ts            # NBA_TEAMS array (all 30 teams)
│   ├── nba-players.ts          # getActivePlayers() / searchPlayers() via Supabase
│   ├── supabase.ts             # Service role client (server-only, for /api/games)
│   ├── supabase-server.ts      # SSR client (cookie-based session)
│   └── types.ts                # Shared TypeScript interfaces
├── middleware.ts               # Protects /roster, redirects auth'd users from /auth
└── scripts/
    ├── scrape.ts               # Scrapes Basketball-Reference for game data
    └── seed-players.ts         # Seeds nba_players table from NBA Stats API
```

## Available Scripts

```bash
npm run dev           # Start development server (localhost:3000)
npm run build         # Production build
npm run scrape        # Scrape 2025–26 NBA schedule into Supabase
npm run seed-players  # Seed active NBA player roster into Supabase

npm run flags:get                         # Print the live agent flags
npm run flags:set DECISION_ENGINE rules   # Set one flag in Redis (instant, no redeploy)
npm run flags:set DECISION_ENGINE --clear # Drop the override, fall back to env/default
npm run agent:ping -- --engine jev        # One route call on a fixed state
npm run eval:routing -- --engine rules    # Score an engine on evals/routing.jsonl
```

## Key Implementation Notes

- **Auth pattern**: always use `supabase.auth.getUser()` in server code — never `getSession()`. The middleware and all server components follow this.
- **Streaming AI**: the `/api/chat` route returns a `ReadableStream` and the chat UI renders tokens as they arrive.
- **Roster context**: when a signed-in user chats with the AI, their roster players are injected into the Gemini system prompt automatically.
- **Unicode names**: player names with diacritics (e.g. Jokić, Vučević) are handled via NFC normalization at both the search and validation layers.
- **Rate limiting**: the `/api/chat` route uses Upstash Redis with a sliding window algorithm (3 req/min per IP). Redis is used instead of in-memory state because Next.js serverless functions each have isolated memory — Redis acts as a shared external store so limits are enforced globally across all instances.
- **shadcn/ui**: use the shadcn CLI to add or update components — do not edit files in `src/components/ui/` directly.


## Decision Engines

The Coach is a tool-using agent. A **decision engine** picks the next tool, decides when to
stop or ask a clarifying question, and checks the finished answer against the tool results.
Gemini still writes every word the user reads — the engine only decides.

Three engines answer the same questions, so they are interchangeable at runtime:

| Engine | What it is | Cost |
|--------|-----------|------|
| `rules` | Deterministic keyword and state routing. The default, the fallback, and the eval baseline. | Free |
| `gemini` | `google.evaluationModel()` answering the same questions through structured output. | Normal Gemini rates |
| `jev` | TypeSafe AI's decision model via Vercel AI Gateway (`typesafe-ai/jev`). Returns calibrated probabilities. | Free until 2026-09-25, then blocked |

Routing asks one `choice` question (`next_action`) over five actions: `get_roster`,
`get_recent_performance`, `get_matchup_stats`, `answer`, `ask_user`. Verification asks two
`boolean` questions (`grounded`, `answers_question`) and one `score` question (`quality`,
logged but never acted on). Jev and Gemini share one question builder so the eval compares
them on identical inputs.

### Toggles

Resolution order is **Redis override → env var → default**. The Redis read is cached in
memory for 30 seconds, so `npm run flags:set` is an instant kill switch with no redeploy.

| Key | Values | Default | Purpose |
|-----|--------|---------|---------|
| `AGENT_MODE` | `on`, `off` | `off` | `off` restores the original single-shot Coach exactly, with no loop and no evaluation call |
| `DECISION_ENGINE` | `jev`, `gemini`, `rules` | `rules` | Engine for every decision |
| `DECISION_ENGINE_ROUTE` | `jev`, `gemini`, `rules` | inherits | Per-capability override for routing |
| `DECISION_ENGINE_VERIFY` | `jev`, `gemini`, `rules`, `off` | inherits | Per-capability override; `off` skips verification |
| `DECISION_FALLBACK` | `gemini`, `rules` | `rules` | Used when the primary errors, lands below threshold, or is blocked |
| `DECISION_SHADOW` | `jev`, `gemini`, `rules`, `off` | `off` | Runs a second engine in parallel for logging only. Never acts |
| `JEV_CUTOFF` | ISO timestamp | `2026-09-25T00:00:00Z` | Jev is blocked at and after this time |
| `JEV_ALLOW_PAID` | `true`, `false` | `false` | The only way to call Jev after the cutoff |
| `ROUTE_MIN_PROB` | 0–1 | `0.6` | Below this the fallback picks the step |
| `VERIFY_MIN_PROB` | 0–1 | `0.7` | Below this an `agent_warning` is emitted |
| `MAX_AGENT_STEPS` | integer | `4` | Loop cap |
| `AGENT_LOOP_TIMEOUT_MS` | integer | `8000` | Time budget before the loop answers with what it has |
| `LOG_DECISION_STATE` | `true`, `false` | `false` | When false, `agent_decisions` stores a hash of the message instead of its text |

The default is `rules` with `AGENT_MODE=off`, so a fresh deploy never calls a paid engine
unless someone turns one on deliberately.

### The cutoff guard

`isJevAllowed()` in `src/lib/agent/config.ts` is the only gate on Jev spend, and every Jev
path goes through it — the loop, shadow mode, `agent:ping`, and the eval harness. It returns
false without `AI_GATEWAY_API_KEY`, false at or after `JEV_CUTOFF`, and true only when
`JEV_ALLOW_PAID=true` overrides both. When Jev is blocked, `getEngine()` silently returns the
fallback engine and warns once per process.

### Streaming contract

With `AGENT_MODE=off` the route streams plain `text/plain` chunks, byte for byte as before.
With it on the response is SSE, and new event types are additive — a client that ignores them
still renders the answer:

| Event | When | UI |
|-------|------|-----|
| `{ type: "text", delta }` | Every answer token | The answer |
| `{ type: "agent_step", action }` | Before a tool runs | A status line under the message ("Checking recent form...") |
| `{ type: "agent_warning", message }` | After the answer, when `grounded` < `VERIFY_MIN_PROB` | A muted note under the answer |

Verification runs *after* the answer has streamed, so it can never delay a word the user
reads — it can only add a note afterwards.

### Eval results

`npm run eval:routing -- --engine <name> [--limit n] [--concurrency 4] [--rpm 5]` runs
`route()` over `evals/routing.jsonl` with no tools executed, and writes a full report to
`evals/results/`. It prints per-action precision and recall, a confusion matrix, latency
percentiles, and a coverage table at thresholds 0.5–0.9 — the last is how `ROUTE_MIN_PROB`
gets calibrated.

40 reviewed cases, covering all five actions including multi-step states:

| Engine | Accuracy | Errors | p50 / p95 | Tokens | Notes |
|--------|----------|--------|-----------|--------|-------|
| `rules` | **90%** (36/40) | 0 | 0 ms / 0 ms | — | Reports no probabilities, so no threshold calibration is possible |
| `gemini` | 40% (16/40) | 23 | 0 ms / 914 ms | 7,322 | 23 cases hit the Gemini free-tier quota; **94% (16/17) of the cases that completed**. Re-run with `--rpm 5` |
| `jev` | not run | — | — | — | Gateway returns "requires a valid credit card on file"; the trial ends 2026-09-25 |

`google.evaluationModel()` does not return `probabilities` on `choice` answers — only Jev
does. So `ROUTE_MIN_PROB` never fires under `gemini`, and the coverage table only fills in
for Jev. Rules reports no probabilities by design.

The four `rules` misses are all the same shape: telling "look up his recent stats" apart from
"you already know enough" is judgment a keyword cannot make, which is the point of having a
model engine to compare against.

### Decision logging

Every route and verify decision is inserted into the `agent_decisions` table
(`sql/agent_decisions.sql`) with the engine, action, probabilities, confidence, latency, and
whether it fell back. Inserts are server-only and no client reads them. Shadow decisions are
logged with `is_shadow = true`. A failed insert never breaks a chat.

## Testing

Two separate test suites cover different layers of the app.

### Unit & Component Tests — Vitest + React Testing Library

```bash
npm test                # Run all unit/component tests once
npm run test:watch      # Re-run on file changes
npm run test:coverage   # Run with coverage report (outputs to coverage/)
```

Tests live in `src/__tests__/` and run in a **happy-dom** environment (no real browser needed). Mock data is passed directly as props, so no database or network calls.

| File | What it covers |
|------|---------------|
| `unit/constants.test.ts` | NBA team constants |
| `unit/games-api.test.ts` | `/api/games` route handler logic |
| `unit/agent-config.test.ts` | Flag resolution order, the 30s cache, and the Jev cutoff guard |
| `unit/agent-engines.test.ts` | All three engines against a mock evaluation model, threshold fallback, verification |
| `unit/agent-loop.test.ts` | Step cap, timeout, repeated tools, `ask_user`, shadow logging |
| `unit/agent-tools.test.ts` | Roster, recent performance, and matchup summaries plus their caching |
| `unit/agent-args.test.ts` | Player resolution from names, initials, and the roster |
| `unit/agent-chat-route.test.ts` | `AGENT_MODE` on and off, SSE framing, `agent_warning` |
| `components/AuthButton.test.tsx` | Auth button render states |
| `components/MobileNav.test.tsx` | Mobile navigation component |
| `components/TeamScheduleTable.test.tsx` | Table sorting, filtering, and badge colours |

### End-to-End Tests — Playwright

```bash
npm run test:e2e        # Run e2e tests (headless)
npm run test:e2e:ui     # Run with the Playwright UI
```

Tests live in `tests/e2e/` and run against a real browser pointed at `localhost:3000`. The dev server starts automatically. Runs against Desktop Chrome and Mobile Chrome (Pixel 5).

| File | What it covers |
|------|---------------|
| `navigation.spec.ts` | Page loads and link navigation |
| `auth.spec.ts` | Login and signup flows |
