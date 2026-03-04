# Homepage Locked Feature Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show Roster and Matchup feature cards to all visitors on the home page, with locked/muted styling and auth-redirecting CTAs for non-logged-in users.

**Architecture:** Extract the four feature cards into a `HomepageFeatureCards` component that accepts `userEmail: string | null`. Logged-out users see Roster and Matchup cards with reduced opacity, a lock badge, and CTAs that link to `/auth?next=/roster` (or `/matchup`). Logged-in users see the same cards with full styling and direct links. `page.tsx` is simplified to render `<HomepageFeatureCards>`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4, lucide-react, Vitest + React Testing Library

---

### Task 1: Write failing unit tests for HomepageFeatureCards

**Files:**
- Create: `src/__tests__/components/HomepageFeatureCards.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomepageFeatureCards } from "@/components/HomepageFeatureCards";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  CalendarDays: () => <svg data-testid="calendar-icon" />,
  Bot: () => <svg data-testid="bot-icon" />,
  Users: () => <svg data-testid="users-icon" />,
  BarChart2: () => <svg data-testid="barchart-icon" />,
  ArrowRight: () => <svg data-testid="arrow-icon" />,
  Lock: () => <svg data-testid="lock-icon" />,
}));

describe("HomepageFeatureCards (logged out)", () => {
  it("always shows all four feature cards", () => {
    render(<HomepageFeatureCards userEmail={null} />);
    expect(screen.getByRole("heading", { name: /schedule analyzer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ai coach/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /my roster/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /matchup analysis/i })).toBeInTheDocument();
  });

  it("roster card links to /auth?next=/roster when logged out", () => {
    render(<HomepageFeatureCards userEmail={null} />);
    const rosterLink = screen.getByRole("link", { name: /my roster/i });
    expect(rosterLink).toHaveAttribute("href", "/auth?next=/roster");
  });

  it("matchup card links to /auth?next=/matchup when logged out", () => {
    render(<HomepageFeatureCards userEmail={null} />);
    const matchupLink = screen.getByRole("link", { name: /matchup analysis/i });
    expect(matchupLink).toHaveAttribute("href", "/auth?next=/matchup");
  });

  it("roster and matchup cards show sign-in CTA text when logged out", () => {
    render(<HomepageFeatureCards userEmail={null} />);
    expect(screen.getByText(/sign in to view roster/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to analyze matchup/i)).toBeInTheDocument();
  });

  it("shows lock badges on roster and matchup cards when logged out", () => {
    render(<HomepageFeatureCards userEmail={null} />);
    const lockBadges = screen.getAllByText(/sign in/i);
    // At least two "sign in" mentions (badges + CTAs)
    expect(lockBadges.length).toBeGreaterThanOrEqual(2);
  });
});

describe("HomepageFeatureCards (logged in)", () => {
  it("roster card links to /roster when logged in", () => {
    render(<HomepageFeatureCards userEmail="user@example.com" />);
    const rosterLink = screen.getByRole("link", { name: /my roster/i });
    expect(rosterLink).toHaveAttribute("href", "/roster");
  });

  it("matchup card links to /matchup when logged in", () => {
    render(<HomepageFeatureCards userEmail="user@example.com" />);
    const matchupLink = screen.getByRole("link", { name: /matchup analysis/i });
    expect(matchupLink).toHaveAttribute("href", "/matchup");
  });

  it("shows normal CTA text when logged in", () => {
    render(<HomepageFeatureCards userEmail="user@example.com" />);
    expect(screen.getByText(/view roster/i)).toBeInTheDocument();
    expect(screen.getByText(/analyze matchup/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- HomepageFeatureCards
```

Expected: FAIL — `Cannot find module '@/components/HomepageFeatureCards'`

---

### Task 2: Create HomepageFeatureCards component

**Files:**
- Create: `src/components/HomepageFeatureCards.tsx`

**Step 3: Write the implementation**

```tsx
import Link from "next/link";
import { ArrowRight, CalendarDays, Bot, Users, BarChart2, Lock } from "lucide-react";

interface Props {
  userEmail: string | null;
}

export function HomepageFeatureCards({ userEmail }: Props) {
  const locked = !userEmail;

  return (
    <div className={`grid gap-5 md:grid-cols-2 lg:grid-cols-4`}>
      {/* Schedule Analyzer */}
      <Link
        href="/analyzer"
        className="group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <CalendarDays className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            Schedule Analyzer
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Pick any date range and instantly see how many games each NBA team plays.
            Identify streaming targets and plan your lineup moves with precision.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            Open analyzer <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* AI Coach */}
      <Link
        href="/chat"
        className="group relative bg-gray-900 rounded-3xl p-9 hover:bg-[#111] transition-colors duration-200 overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-7">
            <Bot className="w-6 h-6 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-3">
            AI Coach
          </h2>
          <p className="text-gray-400 leading-relaxed mb-8 text-[15px]">
            Ask anything about your fantasy team. Get trade advice, waiver wire
            recommendations, and strategic insights powered by a large language model.
          </p>
          <div className="flex items-center gap-1.5 text-orange-400 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            Chat now <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* My Roster */}
      <Link
        href={locked ? "/auth?next=/roster" : "/roster"}
        className={`group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden${locked ? " opacity-75" : ""}`}
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        {locked && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
            <Lock className="w-3 h-3" />
            Sign in
          </div>
        )}
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            My Roster
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Track the NBA players on your fantasy team. Add and remove players
            as the season evolves.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            {locked ? "Sign in to view roster" : "View roster"} <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* Matchup Analysis */}
      <Link
        href={locked ? "/auth?next=/matchup" : "/matchup"}
        className={`group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden${locked ? " opacity-75" : ""}`}
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        {locked && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
            <Lock className="w-3 h-3" />
            Sign in
          </div>
        )}
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <BarChart2 className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            Matchup Analysis
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Compare your roster against your opponent's. See projected stat
            category winners and identify where you need to stream or sit players.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            {locked ? "Sign in to analyze matchup" : "Analyze matchup"} <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- HomepageFeatureCards
```

Expected: All tests PASS

---

### Task 3: Update page.tsx to use HomepageFeatureCards

**Files:**
- Modify: `src/app/(main)/page.tsx`

**Step 5: Replace the feature cards section**

Replace the entire `{/* Feature cards */}` section in `page.tsx`. The new file should look like:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { HomepageFeatureCards } from "@/components/HomepageFeatureCards";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50/70 via-white to-white pointer-events-none" />
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-orange-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-24 text-center">
          {/* Season badge */}
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-4 py-1.5 mb-10">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-sm text-orange-700 font-medium">2025–26 NBA Season</span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold text-gray-900 tracking-tight leading-[1.05] mb-6">
            Win your NBA<br />fantasy league.
          </h1>

          <p className="text-xl text-gray-500 max-w-xl mx-auto mb-12 leading-relaxed">
            Analyze NBA schedules to find streaming opportunities, get personalized advice from an AI coach powered by Gemini, and sign in to get matchup analysis.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/analyzer"
              className="group inline-flex items-center gap-2 bg-gray-900 text-white px-7 py-3.5 rounded-2xl font-semibold text-sm hover:bg-gray-800 transition-colors duration-150"
            >
              Open Schedule Analyzer
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" />
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 bg-white text-gray-900 border border-gray-200 px-7 py-3.5 rounded-2xl font-semibold text-sm hover:bg-gray-50 transition-colors duration-150"
            >
              Chat with AI Coach
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <HomepageFeatureCards userEmail={userEmail} />
      </section>
    </div>
  );
}
```

**Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests PASS (including existing tests for other components)

**Step 7: Build check**

```bash
npm run build
```

Expected: Build completes with no errors

---

### Task 4: Commit

**Step 8: Commit the changes**

```bash
git add src/components/HomepageFeatureCards.tsx \
        src/__tests__/components/HomepageFeatureCards.test.tsx \
        src/app/(main)/page.tsx
git commit -m "feat: show Roster and Matchup cards to all visitors with auth-gated locking"
```
