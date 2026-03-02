import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthButton } from "@/components/AuthButton";

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

vi.mock("@/app/auth/actions", () => ({
  logout: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  LogOut: () => <svg data-testid="logout-icon" />,
}));

describe("AuthButton", () => {
  it('shows "Log In" link to /auth when no email', () => {
    render(<AuthButton userEmail={null} />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/auth");
  });

  it('does not show "Log In" when logged in', () => {
    render(<AuthButton userEmail="user@example.com" />);
    expect(screen.queryByRole("link", { name: /log in/i })).not.toBeInTheDocument();
  });

  it("shows logout button when logged in", () => {
    render(<AuthButton userEmail="user@example.com" />);
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("shows email span when logged in", () => {
    render(<AuthButton userEmail="user@example.com" />);
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });
});
