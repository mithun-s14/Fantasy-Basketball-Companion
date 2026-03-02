import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "@/components/MobileNav";

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
  Menu: () => <svg data-testid="menu-icon" />,
  X: () => <svg data-testid="close-icon" />,
}));

describe("MobileNav", () => {
  it("nav links not in DOM initially", () => {
    render(<MobileNav userEmail={null} />);
    expect(
      screen.queryByRole("link", { name: /schedule analyzer/i })
    ).not.toBeInTheDocument();
  });

  it("hamburger click opens menu", async () => {
    const user = userEvent.setup();
    render(<MobileNav userEmail={null} />);
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(screen.getByRole("link", { name: /schedule analyzer/i })).toBeInTheDocument();
  });

  it("second click closes menu", async () => {
    const user = userEvent.setup();
    render(<MobileNav userEmail={null} />);
    const btn = screen.getByRole("button", { name: /toggle menu/i });
    await user.click(btn);
    await user.click(btn);
    expect(
      screen.queryByRole("link", { name: /schedule analyzer/i })
    ).not.toBeInTheDocument();
  });

  it("shows Roster link when userEmail provided", async () => {
    const user = userEvent.setup();
    render(<MobileNav userEmail="user@example.com" />);
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(screen.getByRole("link", { name: /roster/i })).toBeInTheDocument();
  });

  it("does not show Roster link when userEmail is null", async () => {
    const user = userEvent.setup();
    render(<MobileNav userEmail={null} />);
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(screen.queryByRole("link", { name: /roster/i })).not.toBeInTheDocument();
  });
});
