# Fantasy Basketball Companion

A full-stack web app for fantasy basketball players. Analyze NBA schedules, manage your roster, and get personalized advice from an AI coach.

## Features

- **Schedule Analyzer** — Pick any date range and instantly see how many games each NBA team plays. Color-coded by volume to surface streaming targets and back-to-back situations.
- **AI Coach** — Chat with a Gemini-powered assistant for trade advice, waiver wire recommendations, and lineup decisions. If you're signed in with a saved roster, the AI uses it as context for personalized answers.
- **Roster Management** — Add and remove active NBA players from your fantasy team. Player names are validated against the live NBA roster (pulled from the NBA Stats API and stored in Supabase). Supports accented names (Jokić, Vučević, etc.).
- **Auth** — Email/password sign-up and login via Supabase Auth. The Roster page is protected; the Schedule Analyzer and AI Coach are public.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database & Auth | Supabase (PostgreSQL + Supabase Auth) |
| AI | Google Gemini (`gemini-2.5-flash`) via `@google/generative-ai` |
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
```

## Key Implementation Notes

- **Auth pattern**: always use `supabase.auth.getUser()` in server code — never `getSession()`. The middleware and all server components follow this.
- **Streaming AI**: the `/api/chat` route returns a `ReadableStream` and the chat UI renders tokens as they arrive.
- **Roster context**: when a signed-in user chats with the AI, their roster players are injected into the Gemini system prompt automatically.
- **Unicode names**: player names with diacritics (e.g. Jokić, Vučević) are handled via NFC normalization at both the search and validation layers.
- **shadcn/ui**: use the shadcn CLI to add or update components — do not edit files in `src/components/ui/` directly.

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

## To-do
- [ ] Matchup estimator. Compare user's roster vs opponents and attempt to determine who will win the matchup
- [ ] Add trade analyzer. Help compare player's sent and recieved statistics
- [ ] Implement strength of schedule indicators in Schedule Analyzer page
