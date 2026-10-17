import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, rosterSize, settingsErrors, type LeagueSettings } from "@/lib/league";

const withChanges = (changes: Partial<LeagueSettings>) => ({ ...DEFAULT_SETTINGS, ...changes });

describe("settingsErrors", () => {
  it("accepts the defaults: 12 teams, 9-cat, 13 roster spots", () => {
    expect(settingsErrors(DEFAULT_SETTINGS)).toEqual([]);
    expect(rosterSize(DEFAULT_SETTINGS)).toBe(13);
  });

  it("rejects team counts outside 8 to 20", () => {
    expect(settingsErrors(withChanges({ teamCount: 7 }))).toHaveLength(1);
    expect(settingsErrors(withChanges({ teamCount: 21, draftSlot: 1 }))).toHaveLength(1);
    expect(settingsErrors(withChanges({ teamCount: NaN }))).not.toEqual([]);
  });

  it("rejects a draft slot past the team count", () => {
    expect(settingsErrors(withChanges({ teamCount: 10, draftSlot: 11 }))).toEqual([
      "Draft slot must be between 1 and the team count.",
    ]);
    expect(settingsErrors(withChanges({ draftSlot: 0 }))).toHaveLength(1);
  });

  it("rejects an empty or unknown category list", () => {
    expect(settingsErrors(withChanges({ categories: [] }))).toEqual(["Pick at least one category."]);
    expect(settingsErrors(withChanges({ categories: ["PTS", "DUNKS"] as never }))).toHaveLength(1);
  });

  it("rejects bad roster slots", () => {
    expect(settingsErrors(withChanges({ rosterSlots: { ...DEFAULT_SETTINGS.rosterSlots, C: -1 } }))).toHaveLength(1);
    const empty = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.rosterSlots).map((k) => [k, 0]));
    expect(settingsErrors(withChanges({ rosterSlots: empty as LeagueSettings["rosterSlots"] }))).toEqual([
      "Roster must have 1 to 30 spots in total.",
    ]);
  });

  it("rejects malformed input from the browser", () => {
    expect(settingsErrors({} as LeagueSettings).length).toBeGreaterThan(3);
  });
});
