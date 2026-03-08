"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, signup, signInWithGoogle } from "./actions";
import Balatro from "@/components/Balatro";

function GoogleButton() {
  const [googleState, googleFormAction, isGooglePending] = useActionState(signInWithGoogle, null);
  return (
    <form action={googleFormAction}>
      {googleState?.error && (
        <p className="text-sm text-red-600 mb-2">{googleState.error}</p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="w-full flex items-center gap-2"
        disabled={isGooglePending}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
      </Button>
    </form>
  );
}

function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue.</p>
      </div>
      <GoogleButton />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400 uppercase">
          <span className="bg-white px-2">or</span>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-gray-500">
          New user?{" "}
          <Link
            href="/auth?tab=signup"
            className="text-gray-900 font-semibold hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}

function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create account</h1>
        <p className="text-gray-500 text-sm mt-1">Sign up to manage your fantasy roster.</p>
      </div>
      <GoogleButton />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400 uppercase">
          <span className="bg-white px-2">or</span>
        </div>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm">Confirm password</Label>
          <Input
            id="signup-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="••••••••"
          />
        </div>
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/auth" className="text-gray-900 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

function AuthContent() {
  const searchParams = useSearchParams();
  const isSignup = searchParams.get("tab") === "signup";
  return isSignup ? <SignupForm /> : <LoginForm />;
}

export default function AuthPage() {
  return (
    <div className="flex-1 flex min-h-screen">
      {/* Left: Balatro animation */}
      <div className="hidden md:block w-1/2 relative overflow-hidden">
        <div className="absolute inset-0">
          <Balatro
            spinRotation={-2}
            spinSpeed={10}
            color1="#ea580c"
            color2="#9ca3af"
            color3="#162325"
            contrast={3.5}
            lighting={0.4}
            spinAmount={0.25}
            pixelFilter={700}
          />
        </div>
      </div>

      {/* Right: auth form */}
      <div className="flex-1 flex items-center justify-center px-8 py-16 bg-white">
        <div className="w-full max-w-sm">
          <Suspense fallback={<div className="h-72" />}>
            <AuthContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
