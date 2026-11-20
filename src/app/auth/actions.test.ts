import { describe, it, expect, vi, beforeEach } from "vitest";

// Must hoist mocks before imports
const { mockSignInWithOAuth, mockSignOut, mockSignInWithPassword, mockSignUp } = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
  mockSignOut: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
}));

const mockRedirect = vi.hoisted(() => vi.fn((url: string): never => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT:${url}` });
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => {
      if (key === "x-forwarded-host") return null;
      if (key === "host") return "localhost:3000";
      if (key === "x-forwarded-proto") return "http";
      return null;
    },
  })),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
    },
  })),
}));

import { signInWithGoogle } from "@/app/auth/actions";

describe("signInWithGoogle", () => {
  const emptyFormData = new FormData();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the OAuth URL on success", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth/authorize?client_id=test" },
      error: null,
    });

    await expect(signInWithGoogle(null, emptyFormData)).rejects.toThrow(
      "NEXT_REDIRECT:https://accounts.google.com/oauth/authorize?client_id=test"
    );

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    });
  });

  it("returns error when supabase returns an error", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("OAuth error"),
    });

    const result = await signInWithGoogle(null, emptyFormData);
    expect(result).toEqual({ error: "Could not initiate Google sign-in. Please try again." });
  });

  it("returns error when no URL is returned", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: null,
    });

    const result = await signInWithGoogle(null, emptyFormData);
    expect(result).toEqual({ error: "Could not initiate Google sign-in. Please try again." });
  });

  it("uses NEXT_PUBLIC_SITE_URL env var when set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://myapp.com";
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth?x=1" },
      error: null,
    });

    await expect(signInWithGoogle(null, emptyFormData)).rejects.toThrow();

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://myapp.com/auth/callback" },
    });

    delete process.env.NEXT_PUBLIC_SITE_URL;
  });
});
