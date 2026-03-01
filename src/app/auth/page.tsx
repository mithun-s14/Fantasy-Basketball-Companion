"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, signup } from "./actions";
import Balatro from "@/components/Balatro";

function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue.</p>
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
