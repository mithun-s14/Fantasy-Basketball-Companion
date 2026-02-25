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
