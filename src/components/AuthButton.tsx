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
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
      >
        Log in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500 truncate max-w-[160px]" title={userEmail}>
        {userEmail}
      </span>
      <form action={logout}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Log out"
          className="text-gray-400 hover:text-gray-900 hover:bg-gray-100"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
