import { forwardRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SideMenu } from "@/components/SideMenu";

// HookSidebar measures its rows via refs, so the mock must forward them.
vi.mock("next/link", () => ({
  default: forwardRef<
    HTMLAnchorElement,
    { href: string; children: React.ReactNode; [key: string]: unknown }
  >(function MockLink({ href, children, ...props }, ref) {
    return (
      <a href={href} ref={ref} {...props}>
        {children}
      </a>
    );
  }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/analyzer",
}));

vi.mock("lucide-react", () => ({
  ArrowRight: () => <svg data-testid="arrow-icon" />,
  X: () => <svg data-testid="close-icon" />,
}));

describe("SideMenu", () => {
  it("renders the edge tab collapsed by default", () => {
    render(<SideMenu userEmail={null} />);
    const tab = screen.getByRole("button", { name: /open menu/i });
    expect(tab).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the panel when the tab is clicked", async () => {
    const user = userEvent.setup();
    render(<SideMenu userEmail={null} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("lists all four tools", () => {
    render(<SideMenu userEmail={null} />);
    expect(screen.getByText("Schedule Analyzer")).toBeInTheDocument();
    expect(screen.getByText("AI Coach")).toBeInTheDocument();
    expect(screen.getByText("My Roster")).toBeInTheDocument();
    expect(screen.getByText("Matchup Analysis")).toBeInTheDocument();
  });

  it("routes gated tools through /auth when signed out", () => {
    render(<SideMenu userEmail={null} />);
    expect(screen.getByText("My Roster").closest("a")).toHaveAttribute(
      "href",
      "/auth?next=/roster",
    );
    expect(screen.getByText("Matchup Analysis").closest("a")).toHaveAttribute(
      "href",
      "/auth?next=/matchup",
    );
    expect(screen.getByText("Schedule Analyzer").closest("a")).toHaveAttribute(
      "href",
      "/analyzer",
    );
  });

  it("links gated tools directly and shows the email when signed in", () => {
    render(<SideMenu userEmail="user@example.com" />);
    expect(screen.getByText("My Roster").closest("a")).toHaveAttribute(
      "href",
      "/roster",
    );
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/create a free account/i)).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<SideMenu userEmail={null} />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: /open menu/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
