// League settings for the Draft Assistant (PRD LS-1 to LS-4). Pure, so the
// client form and the save action validate with the same rules.

export const CATEGORIES = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories where a lower number wins. */
export const LOWER_IS_BETTER: readonly Category[] = ["TO"];

export const CATEGORY_PRESETS: Record<string, Category[]> = {
  "9-cat": [...CATEGORIES],
  "8-cat": CATEGORIES.filter((c) => c !== "TO"),
};

export const ROSTER_POSITIONS = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "BENCH"] as const;
export type RosterPosition = (typeof ROSTER_POSITIONS)[number];

export type LeagueFormat = "h2h_cat" | "roto";

export interface LeagueSettings {
  name: string;
  teamCount: number;
  format: LeagueFormat;
  categories: Category[];
  rosterSlots: Record<RosterPosition, number>;
  draftSlot: number;
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  name: "My league",
  teamCount: 12,
  format: "h2h_cat",
  categories: CATEGORY_PRESETS["9-cat"],
  rosterSlots: { PG: 1, SG: 1, G: 1, SF: 1, PF: 1, F: 1, C: 1, UTIL: 3, BENCH: 3 },
  draftSlot: 1,
};

export function rosterSize(settings: LeagueSettings): number {
  return ROSTER_POSITIONS.reduce((sum, pos) => sum + settings.rosterSlots[pos], 0);
}

/**
 * Problems with the settings, empty when valid. Checks types at runtime too,
 * since the save action receives these from the browser.
 */
export function settingsErrors(s: LeagueSettings): string[] {
  const errors: string[] = [];
  const isInt = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

  if (typeof s.name !== "string" || s.name.trim().length === 0 || s.name.length > 60) {
    errors.push("League name must be 1 to 60 characters.");
  }
  if (!isInt(s.teamCount, 8, 20)) errors.push("Team count must be a whole number from 8 to 20.");
  if (s.format !== "h2h_cat" && s.format !== "roto") errors.push("Format must be H2H categories or roto.");
  if (
    !Array.isArray(s.categories) ||
    s.categories.length === 0 ||
    s.categories.some((c) => !CATEGORIES.includes(c)) ||
    new Set(s.categories).size !== s.categories.length
  ) {
    errors.push("Pick at least one category.");
  }
  if (
    typeof s.rosterSlots !== "object" ||
    s.rosterSlots === null ||
    ROSTER_POSITIONS.some((pos) => !isInt(s.rosterSlots[pos], 0, 10))
  ) {
    errors.push("Each roster slot count must be a whole number from 0 to 10.");
  } else if (!isInt(rosterSize(s), 1, 30)) {
    errors.push("Roster must have 1 to 30 spots in total.");
  }
  if (!isInt(s.draftSlot, 1, isInt(s.teamCount, 8, 20) ? s.teamCount : 20)) {
    errors.push("Draft slot must be between 1 and the team count.");
  }
  return errors;
}

/** A league_profiles row, as stored. */
export interface LeagueProfileRow {
  name: string;
  team_count: number;
  format: LeagueFormat;
  categories: Category[];
  roster_slots: Record<RosterPosition, number>;
  draft_slot: number;
}

export function settingsToRow(s: LeagueSettings): LeagueProfileRow {
  return {
    name: s.name.trim(),
    team_count: s.teamCount,
    format: s.format,
    categories: s.categories,
    // Only the known positions, so nothing extra from the browser is stored.
    roster_slots: Object.fromEntries(ROSTER_POSITIONS.map((p) => [p, s.rosterSlots[p]])) as LeagueSettings["rosterSlots"],
    draft_slot: s.draftSlot,
  };
}

export function rowToSettings(r: LeagueProfileRow): LeagueSettings {
  return {
    name: r.name,
    teamCount: r.team_count,
    format: r.format,
    categories: r.categories,
    rosterSlots: { ...DEFAULT_SETTINGS.rosterSlots, ...r.roster_slots },
    draftSlot: r.draft_slot,
  };
}
