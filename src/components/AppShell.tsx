"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Bot, Users, Swords, Lock, TrendingUp } from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { cn } from "@/lib/utils";

interface Props {
  userEmail: string | null;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: Props) {
  const pathname = usePathname();
  const gated = (href: string) => (userEmail ? href : `/auth?next=${href}`);

  const nav = [
    { label: "Overview", short: "Home", path: "/", href: "/", Icon: LayoutDashboard, locked: false },
    { label: "Schedule Analyzer", short: "Schedule", path: "/analyzer", href: "/analyzer", Icon: CalendarDays, locked: false },
    { label: "2026–27 Projections", short: "Projections", path: "/projections", href: "/projections", Icon: TrendingUp, locked: false },
    { label: "AI Coach", short: "Coach", path: "/chat", href: "/chat", Icon: Bot, locked: false },
    { label: "My Roster", short: "Roster", path: "/roster", href: gated("/roster"), Icon: Users, locked: !userEmail },
    { label: "Matchup Analysis", short: "Matchup", path: "/matchup", href: gated("/matchup"), Icon: Swords, locked: !userEmail },
  ];
  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card/60 md:flex">
        <Link href="/" className="flex h-14 items-center gap-2 border-b border-border px-5">
          <Image src="/fbclogo.png" alt="Fantasy Basketball Companion logo" width={28} height={28} priority className="object-contain" />
          <span className="font-display text-lg font-bold uppercase tracking-wide">
            FB<span className="text-primary">C</span>
          </span>
        </Link>

        <nav aria-label="Tools" className="flex-1 space-y-0.5 p-3">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tools</p>
          {nav.map(({ label, path, href, Icon, locked }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-primary")} />
                <span className="flex-1">{label}</span>
                {locked && <Lock className="h-3 w-3 opacity-60" aria-label="Sign in required" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          {userEmail ? (
            <p className="truncate">
              Signed in as <span className="font-medium text-foreground">{userEmail}</span>
            </p>
          ) : (
            <Link href="/auth?tab=signup" className="font-semibold text-primary hover:underline">
              Create a free account →
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <Image src="/fbclogo.png" alt="" width={26} height={26} priority className="object-contain" />
            <span className="font-display text-lg font-bold uppercase tracking-wide">
              FB<span className="text-primary">C</span>
            </span>
          </Link>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <span>{today}</span>
            <span className="rounded-full border border-border px-2 py-0.5">2025–26 season</span>
          </div>
          <AuthButton userEmail={userEmail} />
        </header>

        <main className="flex flex-1 flex-col pb-16 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav aria-label="Tools (mobile)" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {nav.map(({ short, path, href, Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
