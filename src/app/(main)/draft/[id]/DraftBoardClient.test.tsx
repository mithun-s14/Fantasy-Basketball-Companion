import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DraftBoardClient } from "@/app/(main)/draft/[id]/DraftBoardClient";
import { DEFAULT_SETTINGS } from "@/lib/league";
import type { PoolPlayer } from "@/lib/valuation";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { saveDraftRoster } = vi.hoisted(() => ({ saveDraftRoster: vi.fn() }));
vi.mock("@/app/(main)/draft/actions", () => ({ saveDraftRoster }));

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
  unranked: [{ name: "Rookie Phenom", team: "Utah Jazz", positions: [], adp: 20 }],
  players: [
    player("Star Guard", { positions: ["PG"], pts: 30, ast: 9, adp: 1 }),
    player("Star Big", { positions: ["C"], reb: 14, blk: 2.5, pts: 24, adp: 2 }),
    ...Array.from({ length: 30 }, (_, i) => player(`Filler ${i}`, { pts: 8 + i / 2, adp: 40 + i })),
  ],
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});

const board = () => screen.getByRole("list", { name: "Best available players" });
const renderBoard = (draftSlot = 1) =>
  render(
    <DraftBoardClient
      draftId="d1"
      pool={pool}
      settings={{ ...DEFAULT_SETTINGS, draftSlot }}
      initialPunts={[]}
      initialPicks={[]}
    />,
  );

describe("DraftBoardClient", () => {
  it("renders tiers and filters by position", () => {
    renderBoard();
    expect(within(board()).getAllByText(/^Tier \d+$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    expect(within(board()).getByText("Star Big")).toBeInTheDocument();
    expect(within(board()).queryByText("Star Guard")).not.toBeInTheDocument();
  });

  it("marks a pick for the team on the clock and saves it", async () => {
    renderBoard(1);
    expect(screen.getByText("You're on the clock")).toBeInTheDocument();

    fireEvent.click(within(board()).getByText("Star Guard"));

    expect(within(board()).queryByText("Star Guard")).not.toBeInTheDocument();
    expect(screen.getByText("Pick 2")).toBeInTheDocument();
    expect(screen.getByText("Team 2 on the clock")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My picks (1)" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/drafts/d1/picks");
    expect(JSON.parse(init.body)).toEqual({ player_name: "Star Guard", overall_pick: 1 });
  });

  it("undoes the last pick", async () => {
    renderBoard(1);
    fireEvent.click(within(board()).getByText("Star Guard"));
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(within(board()).getByText("Star Guard")).toBeInTheDocument();
    expect(screen.getByText("Pick 1")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("finds players without stats through search and shows next-pick odds", () => {
    renderBoard(5);
    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "rookie" } });
    const row = within(board()).getByText("Rookie Phenom").closest("button")!;
    // Slot 5's next pick is #5; ADP 20 with s = 4 → almost surely still there.
    expect(within(row).getByText("100%")).toBeInTheDocument();
  });

  it("shows an error and keeps going when the server rejects a pick", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Star Guard is already drafted." }) });
    renderBoard(1);
    fireEvent.click(within(board()).getByText("Star Guard"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already drafted");
  });
});

describe("suggestions", () => {
  it("suggests three players for the user's pick and drafts on tap", async () => {
    renderBoard(1);
    const panel = screen.getByText("Suggested for this pick").parentElement!;
    const buttons = within(panel).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText("Pick 2")).toBeInTheDocument();
  });
});

describe("draft complete", () => {
  // Two teams, one roster spot each: two picks finish the draft.
  const tiny = { ...DEFAULT_SETTINGS, teamCount: 2, draftSlot: 1, rosterSlots: { ...DEFAULT_SETTINGS.rosterSlots, PG: 0, SG: 0, G: 0, SF: 0, PF: 0, F: 0, C: 0, UTIL: 1, BENCH: 0 } };
  const picks = [
    { overall_pick: 1, team_slot: 1, player_name: "Star Guard" },
    { overall_pick: 2, team_slot: 2, player_name: "Star Big" },
  ];
  const renderDone = () =>
    render(<DraftBoardClient draftId="d1" pool={pool} settings={tiny} initialPunts={[]} initialPicks={picks} />);

  beforeEach(() => saveDraftRoster.mockReset());

  it("shows category ranks against the other teams", () => {
    renderDone();
    expect(screen.getByText("Draft complete · 2 picks")).toBeInTheDocument();
    // Star Guard out-scores Star Big, out-rebounded by him.
    const cell = (c: string) => screen.getByText(c, { selector: "p.text-xs" }).parentElement!;
    expect(cell("PTS")).toHaveTextContent("1/2");
    expect(cell("REB")).toHaveTextContent("2/2");
    expect(screen.getByText(/^Weakest: /)).toHaveTextContent("REB");
  });

  it("warns before overwriting an existing roster, then replaces it", async () => {
    saveDraftRoster.mockResolvedValueOnce({ confirm: 4 }).mockResolvedValueOnce({ success: true, saved: 1 });
    renderDone();
    fireEvent.click(screen.getByRole("button", { name: "Save as my roster" }));
    expect(await screen.findByText(/already have 4 players on your roster/)).toBeInTheDocument();
    expect(saveDraftRoster).toHaveBeenLastCalledWith("d1", false);

    fireEvent.click(screen.getByRole("button", { name: "Replace my roster" }));
    expect(await screen.findByText("Saved 1 players as your roster.")).toBeInTheDocument();
    expect(saveDraftRoster).toHaveBeenLastCalledWith("d1", true);
    expect(screen.getByRole("link", { name: "Open Matchup" })).toHaveAttribute("href", "/matchup");
  });

  it("can cancel the overwrite", async () => {
    saveDraftRoster.mockResolvedValueOnce({ confirm: 2 });
    renderDone();
    fireEvent.click(screen.getByRole("button", { name: "Save as my roster" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Save as my roster" })).toBeInTheDocument();
    expect(saveDraftRoster).toHaveBeenCalledTimes(1);
  });
});
