import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";

// useActionState is React 19 — not available in the test environment's CJS build
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn(
      (_action: unknown, initialState: unknown) => [initialState, vi.fn(), false] as const
    ),
  };
});

// Mock next/navigation before importing the page
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
}));

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
  login: vi.fn(),
  signup: vi.fn(),
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/components/Balatro", () => ({
  default: () => <div data-testid="balatro" />,
}));

import AuthPage from "@/app/auth/page";
import { useSearchParams } from "next/navigation";

function renderAuthPage() {
  return render(
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}

describe("AuthPage", () => {
  it("renders the Google sign-in button on the login form", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
    renderAuthPage();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("renders the Google sign-in button on the signup form", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=signup") as ReturnType<typeof useSearchParams>
    );
    renderAuthPage();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("renders the email/password form on login tab", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
    renderAuthPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders the signup form on signup tab", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("tab=signup") as ReturnType<typeof useSearchParams>
    );
    renderAuthPage();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("renders an 'or' divider between Google button and email form", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
    renderAuthPage();
    expect(screen.getByText("or")).toBeInTheDocument();
  });
});
