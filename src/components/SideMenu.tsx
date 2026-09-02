"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { HookSidebar, type HookSidebarItem } from "@/components/HookSidebar";

const PANEL_WIDTH = 300;
const PANEL_WIDTH_CSS = `min(${PANEL_WIDTH}px, 85vw)`;
// `-min(...)` is not valid CSS; negate through calc().
const PANEL_OFFSCREEN_CSS = `calc(-1 * ${PANEL_WIDTH_CSS})`;
const ACCENT = "#F26419";

interface SideMenuProps {
  userEmail: string | null;
}

function toolItems(userEmail: string | null): HookSidebarItem[] {
  const gated = (href: string) =>
    userEmail ? href : `/auth?next=${href}`;

  return [
    { label: "Schedule Analyzer", href: "/analyzer" },
    { label: "AI Coach", href: "/chat" },
    { label: "My Roster", href: gated("/roster") },
    { label: "Matchup Analysis", href: gated("/matchup") },
  ];
}

export function SideMenu({ userEmail }: SideMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape, and lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Edge tab — slides right with the panel so it stays attached to its edge */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-menu-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        style={{
          transform: `translate(${open ? PANEL_WIDTH_CSS : "0px"}, -50%)`,
        }}
        className="fixed left-0 top-1/2 z-[80] flex items-center justify-center rounded-r-2xl border border-l-0 border-black/8 bg-white py-7 pl-2.5 pr-3 text-gray-700 shadow-[0_6px_24px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-gray-900"
      >
        {open ? (
          <X className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.28em]"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Menu
          </span>
        )}
      </button>

      {/* Panel */}
      <aside
        id="site-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!open}
        style={{
          width: PANEL_WIDTH,
          transform: `translateX(${open ? "0px" : PANEL_OFFSCREEN_CSS})`,
          // `visibility` keeps the closed panel out of the tab order and the
          // accessibility tree; the delay lets the slide-out finish first.
          visibility: open ? "visible" : "hidden",
          transitionDelay: open ? "0ms, 0ms" : "0ms, 300ms",
        }}
        className="fixed left-0 top-0 z-[70] flex h-full max-w-[85vw] flex-col border-r border-black/8 bg-white transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* Brand */}
        <div className="flex items-center gap-2 border-b border-black/6 px-6 py-5">
          <Image
            src="/fbclogo.png"
            alt=""
            width={34}
            height={34}
            className="object-contain"
          />
          <span className="text-[13px] font-semibold leading-tight tracking-tight text-gray-900">
            Fantasy Basketball
            <br />
            Companion
          </span>
        </div>

        {/* Tools */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <HookSidebar
            label="Tools"
            items={toolItems(userEmail)}
            color={ACCENT}
            onChange={() => setOpen(false)}
          />

          {!userEmail && (
            <p className="mt-6 pl-5 text-[11.5px] leading-relaxed text-gray-400">
              My Roster and Matchup Analysis ask you to sign in first.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-black/6 px-6 py-5">
          {userEmail ? (
            <p className="truncate text-[11.5px] text-gray-400">
              Signed in as{" "}
              <span className="font-medium text-gray-700">{userEmail}</span>
            </p>
          ) : (
            <Link
              href="/auth"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#F26419] hover:underline"
            >
              Create a free account <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
