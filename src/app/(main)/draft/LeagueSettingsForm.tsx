"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORIES,
  CATEGORY_PRESETS,
  LOWER_IS_BETTER,
  ROSTER_POSITIONS,
  rosterSize,
  settingsErrors,
  type Category,
  type LeagueSettings,
} from "@/lib/league";
import { saveLeagueProfile } from "./actions";

interface Props {
  initial: LeagueSettings;
  signedIn: boolean;
  /** Called with every edit that passes validation; rankings follow it live. */
  onValidChange: (settings: LeagueSettings) => void;
}

// Empty number inputs become NaN, which validation rejects, instead of a silent 0.
const toNumber = (value: string) => (value === "" ? NaN : Number(value));
const shown = (n: number) => (Number.isNaN(n) ? "" : n);

export function LeagueSettingsForm({ initial, signedIn, onValidChange }: Props) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<{ error: string } | { success: true } | null>(null);
  const [saving, startSaving] = useTransition();
  const errors = settingsErrors(draft);

  const update = (changes: Partial<LeagueSettings>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    setStatus(null);
    if (settingsErrors(next).length === 0) onValidChange(next);
  };

  const toggleCategory = (c: Category) =>
    update({
      // Keep the canonical order so presets compare equal.
      categories: CATEGORIES.filter((x) => (x === c ? !draft.categories.includes(c) : draft.categories.includes(x))),
    });

  const save = () => startSaving(async () => setStatus(await saveLeagueProfile(draft)));

  const presetName = Object.entries(CATEGORY_PRESETS).find(
    ([, cats]) => cats.length === draft.categories.length && cats.every((c) => draft.categories.includes(c)),
  )?.[0];

  return (
    <form
      className="space-y-5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (signedIn && errors.length === 0) save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="league-name">League name</Label>
          <Input id="league-name" value={draft.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-count">Teams</Label>
          <Input
            id="team-count"
            type="number"
            min={8}
            max={20}
            value={shown(draft.teamCount)}
            onChange={(e) => update({ teamCount: toNumber(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="draft-slot">Your draft slot</Label>
          <Input
            id="draft-slot"
            type="number"
            min={1}
            max={draft.teamCount || 20}
            value={shown(draft.draftSlot)}
            onChange={(e) => update({ draftSlot: toNumber(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="format">Format</Label>
          <select
            id="format"
            value={draft.format}
            onChange={(e) => update({ format: e.target.value as LeagueSettings["format"] })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="h2h_cat" className="bg-card">H2H categories</option>
            <option value="roto" className="bg-card">Roto</option>
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Categories</legend>
        <div className="flex flex-wrap items-center gap-2">
          {Object.keys(CATEGORY_PRESETS).map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={presetName === name ? "default" : "outline"}
              onClick={() => update({ categories: CATEGORY_PRESETS[name] })}
            >
              {name}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">{presetName ? "" : "Custom"}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={draft.categories.includes(c)}
                onChange={() => toggleCategory(c)}
                className="size-4 accent-[var(--accent)]"
              />
              {c}
              {LOWER_IS_BETTER.includes(c) && <span className="text-xs text-muted-foreground">(lower is better)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Roster slots <span className="font-normal text-muted-foreground">· {rosterSize(draft) || 0} spots</span>
        </legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {ROSTER_POSITIONS.map((pos) => (
            <div key={pos} className="space-y-1">
              <Label htmlFor={`slot-${pos}`} className="text-xs text-muted-foreground">
                {pos}
              </Label>
              <Input
                id={`slot-${pos}`}
                type="number"
                min={0}
                max={10}
                value={shown(draft.rosterSlots[pos])}
                onChange={(e) => update({ rosterSlots: { ...draft.rosterSlots, [pos]: toNumber(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-[var(--red)]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        {signedIn ? (
          <Button type="submit" disabled={saving || errors.length > 0}>
            {saving ? "Saving…" : "Save league"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/auth?next=/draft">Sign in to save your league</Link>
          </Button>
        )}
        {status && "success" in status && <span className="text-sm text-[var(--green)]">Saved.</span>}
        {status && "error" in status && <span className="text-sm text-[var(--red)]">{status.error}</span>}
      </div>
    </form>
  );
}
