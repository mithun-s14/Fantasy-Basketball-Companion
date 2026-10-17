"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rosterSize, type Category, type LeagueSettings } from "@/lib/league";
import { rankPlayers } from "@/lib/valuation";
import type { DraftPool } from "@/lib/draft-pool";
import { cn } from "@/lib/utils";
import { LeagueSettingsForm } from "./LeagueSettingsForm";
import { saveLeagueProfile } from "./actions";

interface Props {
  pool: DraftPool;
  initialSettings: LeagueSettings;
  signedIn: boolean;
  activeDraftId: string | null;
}

const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C"];

// Green above the league average, red below; stronger past one standard deviation.
function zClass(z: number) {
  if (z >= 1) return "bg-[var(--green-soft)] text-[var(--green)] font-semibold";
  if (z > 0) return "text-[var(--green)]";
  if (z <= -1) return "bg-[var(--red-soft)] text-[var(--red)] font-semibold";
  if (z < 0) return "text-[var(--red)]";
  return "text-muted-foreground";
}

export function DraftRankingsClient({ pool, initialSettings, signedIn, activeDraftId }: Props) {
  const router = useRouter();
  const [starting, startStarting] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [punts, setPunts] = useState<Category[]>([]);
  const [position, setPosition] = useState("All");
  const [query, setQuery] = useState("");

  const activePunts = punts.filter((c) => settings.categories.includes(c));
  const shownCategories = settings.categories.filter((c) => !activePunts.includes(c));

  const ranked = useMemo(
    () =>
      rankPlayers(pool.players, {
        teamCount: settings.teamCount,
        rosterSize: rosterSize(settings),
        categories: settings.categories,
        punts: activePunts,
      }),
    [pool.players, settings, punts], // activePunts derives from these two
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter(
      (r) =>
        (position === "All" || r.player.positions.includes(position)) &&
        (!q || r.player.name.toLowerCase().includes(q) || r.player.team.toLowerCase().includes(q)),
    );
  }, [ranked, position, query]);

  // Saves the settings on screen, then starts a draft with the current punts.
  const startDraft = () =>
    startStarting(async () => {
      setStartError(null);
      const saved = await saveLeagueProfile(settings);
      if ("error" in saved) return setStartError(saved.error);
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punts: activePunts }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setStartError(body.error ?? "Could not start the draft.");
      router.push(`/draft/${body.id}`);
    });

  const togglePunt = (c: Category) =>
    setPunts((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  // # · player · value · per game · GP · ADP · one per category
  const columnCount = 6 + shownCategories.length;

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {startError && <span role="alert" className="text-sm text-[var(--red)]">{startError}</span>}
        {activeDraftId ? (
          <Button asChild>
            <Link href={`/draft/${activeDraftId}`}>Resume draft</Link>
          </Button>
        ) : signedIn ? (
          <Button onClick={startDraft} disabled={starting}>
            {starting ? "Starting…" : "Start draft"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/auth?next=/draft">Sign in to run a live draft</Link>
          </Button>
        )}
      </div>
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm">
            <span className="font-semibold">{settings.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {settings.teamCount} teams · {settings.format === "roto" ? "Roto" : "H2H"} ·{" "}
              {settings.categories.length} cats · {rosterSize(settings)} spots · pick {settings.draftSlot}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {showSettings ? "Hide" : "Edit league"}
            {showSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {/* Hidden, not unmounted, so unsaved edits survive collapsing. */}
        <div className={cn("border-t border-border", !showSettings && "hidden")}>
          <LeagueSettingsForm initial={initialSettings} signedIn={signedIn} onValidChange={setSettings} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Punt</span>
        {settings.categories.map((c) => (
          <Button
            key={c}
            type="button"
            size="sm"
            variant={activePunts.includes(c) ? "default" : "outline"}
            aria-pressed={activePunts.includes(c)}
            onClick={() => togglePunt(c)}
            className={cn(activePunts.includes(c) && "line-through")}
          >
            {c}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            aria-label="Filter by position"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p} className="bg-card">
                {p === "All" ? "All positions" : p}
              </option>
            ))}
          </select>
          <Input
            type="search"
            placeholder="Search player or team…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:w-56"
            aria-label="Search players"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          {pool.statSeason} per-game stats · ADP from ESPN {pool.draftSeason} · Value is over replacement, discounted
          for games missed · {visible.length} of {ranked.length} players
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Value</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider" title="Per-game value before the games-missed discount">
                  Per game
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">GP</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">ADP</TableHead>
                {shownCategories.map((c) => (
                  <TableHead key={c} className="text-right text-xs uppercase tracking-wider">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r, i) => (
                <Fragment key={r.player.name}>
                  {(i === 0 || visible[i - 1].tier !== r.tier) && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="bg-muted/40 py-1.5 pl-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Tier {r.tier}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    title={`${r.player.gp} GP in ${pool.statSeason} · ${r.player.gpWindow} GP over ${
                      r.player.seasonsInWindow === 2 ? "two seasons" : "one season"
                    } · ${Math.round(r.availability * 100)}% availability`}
                  >
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">
                      {r.rank}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium">{r.player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.player.team} · {r.player.positions.join("/") || "–"}
                        {r.lowGp && (
                          <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold text-[var(--amber)] ring-1 ring-[var(--amber)]/30">
                            Low GP
                          </span>
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.value.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.perGameValue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.player.gp}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.player.adp?.toFixed(1) ?? "–"}</TableCell>
                    {shownCategories.map((c) => (
                      <TableCell key={c} className={cn("text-right tabular-nums", zClass(r.z[c]!))}>
                        {r.z[c]!.toFixed(2)}
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
