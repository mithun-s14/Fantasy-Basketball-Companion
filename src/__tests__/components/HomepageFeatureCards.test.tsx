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
    // Exact match isolates badge elements ("Sign in") from CTA text ("Sign in to view roster")
    expect(screen.getAllByText("Sign in")).toHaveLength(2);
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
    expect(screen.getByText("View roster")).toBeInTheDocument();
    expect(screen.getByText("Analyze matchup")).toBeInTheDocument();
  });
});
