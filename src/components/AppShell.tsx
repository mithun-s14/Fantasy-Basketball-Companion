"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  TrendingUp,
  Swords,
  Users,
  Bot,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface Props {
  userEmail: string | null;
  /** Dashboard subtitle, resolved on the server so the date cannot mismatch. */
  weekLabel: string;
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  short: string;
  path: string;
  Icon: LucideIcon;
  gated?: boolean;
}

// Nav order and grouping per spec section 2.
const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", short: "Home", path: "/", Icon: LayoutDashboard }],
  },
  {
    heading: "Analyze",
    items: [
      { label: "Schedule analyzer", short: "Schedule", path: "/analyzer", Icon: CalendarDays },
      { label: "Projections", short: "Projections", path: "/projections", Icon: TrendingUp },
      { label: "Matchup", short: "Matchup", path: "/matchup", Icon: Swords, gated: true },
    ],
  },
  {
    heading: "Manage",
    items: [
      { label: "My roster", short: "Roster", path: "/roster", Icon: Users, gated: true },
      { label: "AI coach", short: "Coach", path: "/chat", Icon: Bot },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);
// Five tabs on mobile, per spec.
const TAB_PATHS = ["/", "/analyzer", "/matchup", "/roster", "/chat"];

// Page title and subtitle live in the topbar (spec section 5).
const TITLES: Record<string, [string, string]> = {
  "/": ["Dashboard", ""], // subtitle is the week label, passed in
  "/analyzer": ["Schedule analyzer", "Games per NBA team in a date range"],
  "/projections": ["Projections", "2026–27 season averages · all players"],
  "/matchup": ["Matchup", "Category projections for this week"],
  "/roster": ["My roster", "Your players, games and category value"],
  "/chat": ["AI coach", "Trades, waivers and lineup calls"],
};

export function AppShell({ userEmail, weekLabel, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
  const hrefFor = (item: NavItem) =>
    item.gated && !userEmail ? `/auth?next=${item.path}` : item.path;

  const activeItem = ALL_ITEMS.find((i) => isActive(i.path));
  const [title, staticSub] = TITLES[activeItem?.path ?? ""] ?? ["", ""];
  const subtitle = activeItem?.path === "/" ? `Week of ${weekLabel}` : staticSub;

  return (
    <div
      className="grid min-h-screen transition-[grid-template-columns] duration-200 ease-in-out max-[900px]:grid-cols-1"
      style={{ gridTemplateColumns: `${collapsed ? "64px" : "var(--sidebar-w)"} 1fr` }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] max-[900px]:hidden">
        <Link
          href="/"
          className="flex h-14 flex-none items-center gap-2.5 whitespace-nowrap border-b border-[var(--border)] px-3.5"
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-[7px] bg-[var(--accent)] text-xs font-bold text-white">
            FBC
          </span>
          {!collapsed && (
            <>
              <span className="text-sm font-semibold">Fantasy Companion</span>
              <span className="ml-auto text-[11px] text-[var(--text-3)]">26–27</span>
            </>
          )}
        </Link>

        <nav aria-label="Tools" className="flex-1 overflow-y-auto p-2">
          {SECTIONS.map(({ heading, items }, sectionIndex) => (
            <div key={heading}>
              <p
                className={cn(
                  "whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]",
                  sectionIndex === 0 ? "mb-1.5 mt-2" : "mb-1.5 mt-5",
                  collapsed && "invisible mb-0 h-0",
                )}
              >
                {heading}
              </p>
              {items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={hrefFor(item)}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm transition-colors",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--text)]"
                        : "text-[var(--text-2)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                      collapsed && "justify-center px-0",
                      // 3px accent bar on the left edge of the active item
                      active &&
                        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-sm before:bg-[var(--accent)] before:content-['']",
                    )}
                  >
                    <item.Icon className="h-[18px] w-[18px] flex-none" strokeWidth={1.75} />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.gated && !userEmail && (
                          <span className="rounded border border-[var(--border)] px-[5px] py-px text-[10px] text-[var(--text-3)]">
                            Sign in
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex-none border-t border-[var(--border)] p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : undefined}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              collapsed && "justify-center px-0",
            )}
          >
            <ChevronLeft
              className={cn("h-[18px] w-[18px] flex-none transition-transform", collapsed && "rotate-180")}
              strokeWidth={1.75}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-6 max-[900px]:gap-2 max-[900px]:px-4">
          <h1 className="flex-none whitespace-nowrap text-base font-semibold">{title}</h1>
          {subtitle && (
            <span className="truncate text-[13px] text-[var(--text-3)] max-[900px]:hidden">
              {subtitle}
            </span>
          )}
          <div className="flex-1" />
          <ThemeToggle />
          <AuthButton userEmail={userEmail} />
        </header>

        <main className="flex flex-1 flex-col max-[900px]:pb-[60px]">{children}</main>
      </div>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <nav
        aria-label="Tools (mobile)"
        className="fixed inset-x-0 bottom-0 z-30 hidden h-[60px] border-t border-[var(--border)] bg-[var(--surface)] max-[900px]:flex"
      >
        {TAB_PATHS.map((path) => {
          const item = ALL_ITEMS.find((i) => i.path === path)!;
          const active = isActive(path);
          return (
            <Link
              key={path}
              href={hrefFor(item)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-[3px] text-[10px]",
                active ? "text-[var(--accent)]" : "text-[var(--text-3)]",
              )}
            >
              <item.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
