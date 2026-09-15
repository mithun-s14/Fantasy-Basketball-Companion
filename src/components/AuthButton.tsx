"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/auth/actions";

interface Props {
  userEmail: string | null;
}

export function AuthButton({ userEmail }: Props) {
  if (!userEmail) {
    return (
      <Link
        href="/auth"
        className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Log In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-[180px] truncate rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground sm:inline"
        title={userEmail}
      >
        {userEmail}
      </span>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Log out" className="text-muted-foreground">
          <LogOut className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
