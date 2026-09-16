"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, TrendingUp, Swords } from "lucide-react";
import { login, signup, signInWithGoogle } from "./actions";

/* ── shared pieces, styled from the design tokens ───────────────────────── */

const INPUT =
  "h-8 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus-visible:outline-none";
const LABEL = "text-[11px] text-[var(--text-3)]";
const BTN_PRIMARY =
  "flex h-8 w-full items-center justify-center rounded-md bg-[var(--accent)] px-3 text-[13px] font-medium text-white transition hover:brightness-110 disabled:opacity-60";
const BTN_OUTLINE =
  "flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)] disabled:opacity-60";

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input id={id} className={INPUT} {...props} />
    </div>
  );
}

/** Inline error banner, per spec section 4 (States → Error). */
function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-[var(--red)]/40 bg-[var(--red-soft)] px-2.5 py-2 text-[12px] text-[var(--red)]"
    >
      {message}
    </p>
  );
}

function Divider() {
  return (
    <div className="relative">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--border)]" />
      <span className="relative mx-auto block w-fit bg-[var(--surface)] px-2 text-[11px] uppercase tracking-[0.04em] text-[var(--text-3)]">
        or
      </span>
    </div>
  );
}

function GoogleButton() {
  const [googleState, googleFormAction, isGooglePending] = useActionState(signInWithGoogle, null);
  return (
    <form action={googleFormAction} className="flex flex-col gap-2">
      {googleState?.error && <ErrorBanner message={googleState.error} />}
      <button type="submit" className={"flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)] disabled:opacity-60"} disabled={isGooglePending}>
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
          />
        </svg>
        {isGooglePending ? "Redirecting…" : "Continue with Google"}
      </button>
    </form>
  );
}

/** Sign in / Create account, as the spec's segmented control. */
function Tabs({ isSignup }: { isSignup: boolean }) {
  const tab = (label: string, href: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex h-[30px] flex-1 items-center justify-center text-xs ${
        on ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-[var(--text-2)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex overflow-hidden rounded-md border border-[var(--border-strong)]">
      {tab("Sign in", "/auth", !isSignup)}
      <span className="w-px bg-[var(--border)]" />
      {tab("Create account", "/auth?tab=signup", isSignup)}
    </div>
  );
}

/* ── forms ──────────────────────────────────────────────────────────────── */

function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <>
      <h1 className="text-base font-semibold">Welcome back</h1>
      <p className="mb-4 mt-0.5 text-[13px] text-[var(--text-3)]">
        Sign in to track your roster and matchups.
      </p>
      <GoogleButton />
      <div className="my-4">
        <Divider />
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <Field
          id="login-email"
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <Field
          id="login-password"
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
        {state?.error && <ErrorBanner message={state.error} />}
        <button type="submit" className={BTN_PRIMARY} disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-[12px] text-[var(--text-3)]">
        New user?{" "}
        <Link href="/auth?tab=signup" className="font-medium text-[var(--accent)] hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, null);

  return (
    <>
      <h1 className="text-base font-semibold">Create account</h1>
      <p className="mb-4 mt-0.5 text-[13px] text-[var(--text-3)]">
        Free, and takes about a minute.
      </p>
      <GoogleButton />
      <div className="my-4">
        <Divider />
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <Field
          id="signup-email"
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <Field
          id="signup-password"
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
        />
        <Field
          id="signup-confirm"
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
        {state?.error && <ErrorBanner message={state.error} />}
        <button type="submit" className={BTN_PRIMARY} disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-center text-[12px] text-[var(--text-3)]">
        Already have an account?{" "}
        <Link href="/auth" className="font-medium text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

function AuthContent() {
  const searchParams = useSearchParams();
  const isSignup = searchParams.get("tab") === "signup";
  return (
    <>
      <Tabs isSignup={isSignup} />
      {isSignup ? <SignupForm /> : <LoginForm />}
    </>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

const SELLING_POINTS = [
  { Icon: CalendarDays, title: "Schedule analyzer", body: "Game counts per team over any date range." },
  { Icon: TrendingUp, title: "Projections", body: "2026–27 season averages with category value." },
  { Icon: Swords, title: "Matchup analysis", body: "Project all nine categories against your opponent." },
];

export default function AuthPage() {
  return (
    <div className="flex min-h-screen flex-1">
      {/* Left: quiet brand panel, hidden on narrow screens */}
      <aside className="hidden w-1/2 max-w-[520px] flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] p-10 min-[901px]:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-[var(--accent)] text-xs font-bold text-white">
            FBC
          </span>
          <span className="text-sm font-semibold">Fantasy Companion</span>
          <span className="text-[11px] text-[var(--text-3)]">26–27</span>
        </Link>

        <div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">
            Win the schedule.
            <br />
            Win the week.
          </h2>
          <p className="mt-2 max-w-[36ch] text-[13px] text-[var(--text-2)]">
            Every lineup call starts with who plays how often. Sign in to keep your roster and
            matchup in one place.
          </p>

          <ul className="mt-8 flex flex-col gap-4">
            {SELLING_POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                  <Icon className="h-4 w-4 text-[var(--text-3)]" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-[13px] font-medium">{title}</span>
                  <span className="block text-[12px] text-[var(--text-3)]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-[var(--text-3)]">Not affiliated with the NBA.</p>
      </aside>

      {/* Right: auth card */}
      <div className="flex flex-1 items-center justify-center bg-[var(--bg)] px-6 py-16">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-5 flex items-center justify-center gap-2.5 min-[901px]:hidden"
          >
            <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-[var(--accent)] text-xs font-bold text-white">
              FBC
            </span>
            <span className="text-sm font-semibold">Fantasy Companion</span>
          </Link>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <Suspense fallback={<div className="h-72" />}>
              <AuthContent />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
