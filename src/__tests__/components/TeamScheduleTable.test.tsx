import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamScheduleTable } from "@/components/TeamScheduleTable";

const start = new Date("2026-01-01");
const end = new Date("2026-01-07");
const allTeams = new Set(["Boston Celtics", "Los Angeles Lakers", "Golden State Warriors"]);

describe("TeamScheduleTable", () => {
  // When startDate/endDate are both undefined, the component skips the table
  // and renders a CardDescription placeholder instead.
  it("shows placeholder when no dates", () => {
    render(
      <TeamScheduleTable
        gameCounts={new Map()}
        startDate={undefined}
        endDate={undefined}
        selectedTeams={new Set()}
      />
    );
    expect(screen.getByText("Select a date range to view game counts")).toBeInTheDocument();
  });

  // With valid dates and a gameCounts map, every team in selectedTeams
  // should appear as its own table row.
  it("renders a row per selected team", () => {
    const gameCounts = new Map([
      ["Boston Celtics", 4],
      ["Los Angeles Lakers", 3],
      ["Golden State Warriors", 2],
    ]);
    render(
      <TeamScheduleTable
        gameCounts={gameCounts}
        startDate={start}
        endDate={end}
        selectedTeams={allTeams}
      />
    );
    expect(screen.getByText("Boston Celtics")).toBeInTheDocument();
    expect(screen.getByText("Los Angeles Lakers")).toBeInTheDocument();
    expect(screen.getByText("Golden State Warriors")).toBeInTheDocument();
  });

  // Teams should be ordered by game count descending. When two teams are tied
  // (Boston and Golden State both have 3), they should break the tie
  // alphabetically ascending — Boston before Golden State.
  it("sorts descending by count, alpha-ascending as tiebreak", () => {
    const gameCounts = new Map([
      ["Golden State Warriors", 3],
      ["Boston Celtics", 3],
      ["Los Angeles Lakers", 5],
    ]);
    render(
      <TeamScheduleTable
        gameCounts={gameCounts}
        startDate={start}
        endDate={end}
        selectedTeams={allTeams}
      />
    );
    const rows = screen.getAllByRole("row");
    // rows[0] is the header; rows[1..3] are data rows
    expect(rows[1]).toHaveTextContent("Los Angeles Lakers");
    expect(rows[2]).toHaveTextContent("Boston Celtics");
    expect(rows[3]).toHaveTextContent("Golden State Warriors");
  });

  // The count badge should be colour-coded: 
  // green for >= 4 games,
  // yellow for >= 2, 
  // and red for <2.
  // The rank column also renders numbers, so getBadge targets only <span>
  // elements to avoid false matches on the rank cell.
  it("shows green badge for ≥4 games, yellow for ≥2, red for <2", () => {
    const gameCounts = new Map([
      ["Boston Celtics", 4],
      ["Los Angeles Lakers", 2],
      ["Golden State Warriors", 1],
    ]);
    render(
      <TeamScheduleTable
        gameCounts={gameCounts}
        startDate={start}
        endDate={end}
        selectedTeams={allTeams}
      />
    );
    // Rank column also contains numbers, so target the badge <span> elements specifically
    const getBadge = (text: string) =>
      screen.getAllByText(text).find((el) => el.tagName === "SPAN");
    expect(getBadge("4")).toHaveClass("bg-green-100");
    expect(getBadge("2")).toHaveClass("bg-yellow-100");
    expect(getBadge("1")).toHaveClass("bg-red-100");
  });

  // Even if gameCounts contains entries for all three teams, only the teams
  // present in selectedTeams should be rendered. Lakers and Warriors should
  // be completely absent from the DOM.
  it("filters out teams not in selectedTeams", () => {
    const gameCounts = new Map([
      ["Boston Celtics", 4],
      ["Los Angeles Lakers", 3],
      ["Golden State Warriors", 2],
    ]);
    render(
      <TeamScheduleTable
        gameCounts={gameCounts}
        startDate={start}
        endDate={end}
        selectedTeams={new Set(["Boston Celtics"])}
      />
    );
    expect(screen.getByText("Boston Celtics")).toBeInTheDocument();
    expect(screen.queryByText("Los Angeles Lakers")).not.toBeInTheDocument();
    expect(screen.queryByText("Golden State Warriors")).not.toBeInTheDocument();
  });
});
