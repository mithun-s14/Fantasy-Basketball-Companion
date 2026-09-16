import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Monday-to-Sunday week containing today, as ISO bounds plus a display label.
export function getWeekRange(): { start: string; end: string; label: string } {
  const today = new Date();
  const day = today.getDay(); // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const iso = (d: Date) => d.toISOString().split("T")[0];
  const label = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return { start: iso(mon), end: iso(sun), label: `${label(mon)} – ${label(sun)}` };
}

// Game-count tiers: ≥4 start, ≥2 ok, <2 sit.
export function gameTierClass(games: number) {
  if (games >= 4) return "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
  if (games >= 2) return "bg-amber-400/15 text-amber-300 ring-amber-400/30"
  return "bg-rose-500/15 text-rose-300 ring-rose-500/30"
}
