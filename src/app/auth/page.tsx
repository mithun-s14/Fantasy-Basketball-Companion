"use client";

import { useActionState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, signup } from "./actions";

function LoginForm() {
  const [state, formAction] = useActionState(login, null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => formAction(formData))}
      className="space-y-4"
    >
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
    </form>
  );
}

function SignupForm() {
  const [state, formAction] = useActionState(signup, null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => formAction(formData))}
      className="space-y-4"
    >
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
    </form>
  );
}

function AuthTabs() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="w-full mb-6">
        <TabsTrigger value="login" className="flex-1">
          Sign in
        </TabsTrigger>
        <TabsTrigger value="signup" className="flex-1">
          Sign up
        </TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <LoginForm />
      </TabsContent>
      <TabsContent value="signup">
        <SignupForm />
      </TabsContent>
    </Tabs>
  );
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Auth card */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Welcome back
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              Sign in or create an account to manage your roster.
            </p>
          </div>

          <div className="bg-gray-50 rounded-3xl p-8">
            <Suspense fallback={<div className="h-48" />}>
              <AuthTabs />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
