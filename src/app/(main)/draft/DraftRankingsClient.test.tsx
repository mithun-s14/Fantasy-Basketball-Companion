import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DraftRankingsClient } from "@/app/(main)/draft/DraftRankingsClient";
import { DEFAULT_SETTINGS } from "@/lib/league";
import type { PoolPlayer } from "@/lib/valuation";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/app/(main)/draft/actions", () => ({ saveLeagueProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

function player(name: string, overrides: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    name, team: "Boston Celtics", positions: ["SF"], gp: 82, gpWindow: 164, seasonsInWindow: 2,
    pts: 15, reb: 5, ast: 3, stl: 1, blk: 0.5, three_pm: 1.5, tov: 2, fgm: 6, fga: 13, ftm: 2, fta: 2.5, adp: null,
    ...overrides,
  };
}

const pool = {
  draftSeason: "2026-27",
  statSeason: "2025-26",
  rotoballer: {},
  unranked: [],
  players: [
    player("Guard Shooter", { positions: ["PG"], pts: 25, ast: 8, ftm: 6, fta: 6.5 }),
    player("Brick Big", { positions: ["C"], reb: 13, blk: 2.5, pts: 22, ftm: 2, fta: 7 }),
    ...Array.from({ length: 20 }, (_, i) => player(`Filler ${i}`, { pts: 8 + i / 2, reb: 3 + (i % 5) })),
  ],
};

const rankOf = (name: string) => Number(within(screen.getByText(name).closest("tr")!).getAllByRole("cell")[0].textContent);

describe("DraftRankingsClient", () => {
  it("re-ranks when a category is punted", () => {
    render(<DraftRankingsClient pool={pool} initialSettings={DEFAULT_SETTINGS} signedIn={false} activeDraftId={null} />);
    expect(rankOf("Guard Shooter")).toBe(1);
    expect(screen.getAllByRole("columnheader").some((h) => h.textContent === "FT%")).toBe(true);

    for (const c of ["FT%", "PTS", "AST"]) fireEvent.click(screen.getByRole("button", { name: c }));

    expect(rankOf("Brick Big")).toBe(1);
    expect(screen.getByRole("button", { name: "FT%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("columnheader").some((h) => h.textContent === "FT%")).toBe(false);
  });

  it("filters by position and shows tier dividers", () => {
    render(<DraftRankingsClient pool={pool} initialSettings={DEFAULT_SETTINGS} signedIn={false} activeDraftId={null} />);
    expect(screen.getAllByText(/^Tier \d+$/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filter by position"), { target: { value: "C" } });
    expect(screen.getByText("Brick Big")).toBeInTheDocument();
    expect(screen.queryByText("Guard Shooter")).not.toBeInTheDocument();
  });

  it("asks logged-out users to sign in to save", () => {
    render(<DraftRankingsClient pool={pool} initialSettings={DEFAULT_SETTINGS} signedIn={false} activeDraftId={null} />);
    expect(screen.getByRole("link", { name: /sign in to run a live draft/i })).toHaveAttribute("href", "/auth?next=/draft");
    expect(screen.getByRole("link", { name: /sign in to save/i })).toHaveAttribute("href", "/auth?next=/draft");
  });
});
