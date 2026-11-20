import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchupProjectionTable } from "@/components/MatchupProjectionTable";
import type { MatchupResult } from "@/lib/matchup";

function makeResult(overrides: Partial<MatchupResult> = {}): MatchupResult {
  return {
    userWins: 5,
    opponentWins: 4,
    categories: [
      { category: "pts",      label: "PTS",  userTotal: 150.5, opponentTotal: 120.0, winner: "user" },
      { category: "reb",      label: "REB",  userTotal: 45.0,  opponentTotal: 50.0,  winner: "opponent" },
      { category: "ast",      label: "AST",  userTotal: 30.0,  opponentTotal: 30.0,  winner: "tie" },
      { category: "stl",      label: "STL",  userTotal: 8.0,   opponentTotal: 6.0,   winner: "user" },
      { category: "blk",      label: "BLK",  userTotal: 4.0,   opponentTotal: 5.0,   winner: "opponent" },
      { category: "three_pm", label: "3PM",  userTotal: 18.0,  opponentTotal: 15.0,  winner: "user" },
      { category: "fg_pct",   label: "FG%",  userTotal: 0.48,  opponentTotal: 0.45,  winner: "user" },
      { category: "ft_pct",   label: "FT%",  userTotal: 0.80,  opponentTotal: 0.75,  winner: "user" },
      { category: "tov",      label: "TO",   userTotal: 20.0,  opponentTotal: 18.0,  winner: "opponent" },
    ],
    ...overrides,
  };
}

describe("MatchupProjectionTable", () => {
  it("renders all 9 category labels", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    for (const label of ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the overall score", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    // e.g. "5–4" somewhere in the output
    expect(screen.getByText(/5.+4/)).toBeInTheDocument();
  });

  it("shows percentage values as percentages (FG%, FT%)", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    // 0.48 should be rendered as "48.0%" not "0.48"
    expect(screen.getByText("48.0%")).toBeInTheDocument();
  });

  it("renders a row for each category", () => {
    render(<MatchupProjectionTable result={makeResult()} />);
    const rows = screen.getAllByRole("row");
    // 1 header + 9 data rows
    expect(rows.length).toBe(10);
  });
});
