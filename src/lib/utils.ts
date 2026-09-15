import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Game-count tiers: ≥4 start, ≥2 ok, <2 sit.
export function gameTierClass(games: number) {
  if (games >= 4) return "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
  if (games >= 2) return "bg-amber-400/15 text-amber-300 ring-amber-400/30"
  return "bg-rose-500/15 text-rose-300 ring-rose-500/30"
}
