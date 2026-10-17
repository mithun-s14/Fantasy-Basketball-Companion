"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROSTER_POSITIONS, rosterSize, type Category, type LeagueSettings } from "@/lib/league";
import { rankPlayers, type PoolPlayer, type RankedPlayer } from "@/lib/valuation";
import {
  adpFlag,
  categoryProfile,
  adpRanks,
  categoryRanks,
  suggestPicks,
  nextPickFor,
  openSlots,
  pAvailable,
  roundOf,
  teamOnClock,
  withoutLastPick,
  type DraftPick,
} from "@/lib/draft";
import type { DraftPool, UnrankedPlayer } from "@/lib/draft-pool";
import { cn } from "@/lib/utils";
import { saveDraftRoster, type SaveRosterResult } from "../actions";

interface Props {
  draftId: string;
  pool: DraftPool;
  settings: LeagueSettings;
  initialPunts: Category[];
  initialPicks: DraftPick[];
}

const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C"];
const pct = (p: number | null) => (p == null ? "–" : `${Math.round(p * 100)}%`);

function FlagChip({ flag }: { flag: "value" | "reach" | null }) {
  if (!flag) return null;
  return flag === "value" ? (
    <span className="ml-1 text-[var(--green)]" title="Our value rank is well ahead of ESPN ADP: he tends to go later than he's worth">
      · Value
    </span>
  ) : (
    <span className="ml-1 text-[var(--red)]" title="ESPN ADP is well ahead of our value rank: taking him at ADP is a reach">
      · Reach
    </span>
  );
}

function oddsClass(p: number | null) {
  if (p == null) return "text-muted-foreground";
  if (p >= 0.7) return "text-[var(--green)]";
  if (p <= 0.3) return "text-[var(--red)] font-semibold";
  return "text-[var(--amber)]";
}

export function DraftBoardClient({ draftId, pool, settings, initialPunts, initialPicks }: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState(initialPicks);
  const [punts, setPunts] = useState(initialPunts);
  const [position, setPosition] = useState("All");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"board" | "team">("board");
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  // After router.refresh() (on a failed request) the server's picks win.
  useEffect(() => setPicks(initialPicks), [initialPicks]);

  // Requests run one at a time so picks reach the server in order; the UI
  // updates right away.
  const queue = useRef(Promise.resolve());
  const send = (input: string, init: RequestInit) => {
    queue.current = queue.current.then(async () => {
      const res = await fetch(input, { headers: { "Content-Type": "application/json" }, ...init }).catch(() => null);
      if (!res?.ok) {
        const body = await res?.json().catch(() => ({}));
        setError(body?.error ?? "Couldn't reach the server. The board was reloaded from your saved picks.");
        router.refresh();
      }
    });
  };

  const teamCount = settings.teamCount;
  const totalPicks = teamCount * rosterSize(settings);
  const current = picks.length + 1;
  const complete = picks.length >= totalPicks;
  const onClock = teamOnClock(current, teamCount);
  const myTurn = onClock === settings.draftSlot;
  // The user's next pick after this one: odds that a player lasts until then.
  const oddsAt = nextPickFor(settings.draftSlot, current, teamCount);
  const oddsPick = oddsAt <= totalPicks ? oddsAt : null;
  const untilMyTurn = myTurn ? 0 : oddsAt - current;

  const activePunts = punts.filter((c) => settings.categories.includes(c));
  const ranked = useMemo(
    () =>
      rankPlayers(pool.players, {
        teamCount,
        rosterSize: rosterSize(settings),
        categories: settings.categories,
        punts: activePunts,
      }),
    [pool.players, settings, punts], // activePunts derives from these
  );
  const byName = useMemo(() => new Map(ranked.map((r) => [r.player.name, r])), [ranked]);
  const adpRankOf = useMemo(() => adpRanks(ranked), [ranked]);
  const unrankedByName = useMemo(() => new Map(pool.unranked.map((u) => [u.name, u])), [pool.unranked]);

  const drafted = new Set(picks.map((p) => p.player_name));
  const q = query.trim().toLowerCase();
  const matches = (name: string, team: string, positions: string[]) =>
    (position === "All" || positions.includes(position)) &&
    (!q || name.toLowerCase().includes(q) || team.toLowerCase().includes(q));
  const available = ranked.filter((r) => !drafted.has(r.player.name) && matches(r.player.name, r.player.team, r.player.positions));
  // Players without last season's stats are only listed when searching.
  const unrankedMatches: UnrankedPlayer[] = q
    ? pool.unranked.filter((u) => !drafted.has(u.name) && matches(u.name, u.team, u.positions))
    : [];

  const myPicks = picks.filter((p) => p.team_slot === settings.draftSlot);
  const myRanked = myPicks.map((p) => byName.get(p.player_name)).filter((r): r is RankedPlayer => !!r);
  const needs = openSlots(
    settings.rosterSlots,
    myPicks.map((p) => ({ positions: byName.get(p.player_name)?.player.positions ?? unrankedByName.get(p.player_name)?.positions ?? [] })),
  );
  const profile = categoryProfile(myRanked, settings.categories.filter((c) => !activePunts.includes(c)));
  // Suggestions ignore the position and search filters: they're for the user's pick.
  const suggestions = suggestPicks(
    ranked.filter((r) => !drafted.has(r.player.name)),
    needs,
    oddsPick,
  );

  // RH-3, once the draft is done: rank in each category against every team.
  const summary = useMemo(() => {
    if (!complete) return null;
    const teams: PoolPlayer[][] = Array.from({ length: teamCount }, () => []);
    for (const p of picks) {
      const r = byName.get(p.player_name);
      if (r) teams[p.team_slot - 1].push(r.player);
    }
    const ranks = categoryRanks(teams, settings.draftSlot, settings.categories);
    const weakest = ranks
      .filter((r) => !activePunts.includes(r.category))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3)
      .filter((r) => r.rank > teamCount / 2);
    return { ranks, weakest };
  }, [complete, picks, byName, teamCount, settings, punts]); // activePunts derives from punts

  const [saveResult, setSaveResult] = useState<SaveRosterResult | null>(null);
  const [saving, startSaving] = useTransition();
  const saveRoster = (overwrite: boolean) =>
    startSaving(async () => setSaveResult(await saveDraftRoster(draftId, overwrite)));

  const draftPlayer = (name: string) => {
    if (complete || drafted.has(name)) return;
    setError(null);
    setPicks((p) => [...p, { overall_pick: current, team_slot: onClock, player_name: name }]);
    setQuery("");
    send(`/api/drafts/${draftId}/picks`, { method: "POST", body: JSON.stringify({ player_name: name, overall_pick: current }) });
  };

  const undo = () => {
    if (picks.length === 0) return;
    setError(null);
    setPicks((p) => withoutLastPick(p));
    send(`/api/drafts/${draftId}/picks`, { method: "DELETE" });
  };

  const togglePunt = (c: Category) => {
    const next = punts.includes(c) ? punts.filter((x) => x !== c) : [...punts, c];
    setPunts(next);
    send(`/api/drafts/${draftId}`, { method: "PATCH", body: JSON.stringify({ punts: next }) });
  };

  const abandon = async () => {
    if (!confirmAbandon) return setConfirmAbandon(true);
    await queue.current;
    const res = await fetch(`/api/drafts/${draftId}`, { method: "DELETE" });
    if (!res.ok) return setError("Could not abandon the draft.");
    router.push("/draft");
    router.refresh();
  };

  const teamLabel = (slot: number) => (slot === settings.draftSlot ? "You" : `Team ${slot}`);
  const recent = picks.slice(-3).reverse();

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6">
      {/* Top bar: whose pick it is (DB-1) */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {complete ? (
            <p className="text-sm font-semibold">Draft complete · {totalPicks} picks</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-display text-xl font-bold tabular-nums">Pick {current}</span>
                <span className="text-muted-foreground"> · Round {roundOf(current, teamCount)}</span>
              </p>
              <p className={cn("rounded-full px-3 py-1 text-sm font-semibold", myTurn ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {myTurn ? "You're on the clock" : `${teamLabel(onClock)} on the clock`}
              </p>
              {!myTurn && oddsPick && (
                <p className="text-sm text-muted-foreground">
                  Your pick in <span className="font-semibold text-foreground">{untilMyTurn}</span> (#{oddsPick})
                </p>
              )}
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={picks.length === 0}>
              <Undo2 /> Undo
            </Button>
          </div>
        </div>
        {recent.length > 0 && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {recent.map((p) => `#${p.overall_pick} ${teamLabel(p.team_slot)}: ${p.player_name}`).join(" · ")}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1.5 text-sm text-[var(--red)]">
            {error}
          </p>
        )}
      </div>

      {/* Mobile: board and team are tabs; side by side from lg up. */}
      <div className="flex gap-2 lg:hidden">
        {(["board", "team"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t === "board" ? "Best available" : `My team (${myPicks.length})`}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className={cn("space-y-3", tab !== "board" && "max-lg:hidden")}>
          {complete ? (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-sm">
              <div>
                <p className="font-semibold">Every pick is in.</p>
                <p className="mt-1 text-muted-foreground">
                  Where your team ranks in each category among the {teamCount} teams, from last season&apos;s per-game
                  stats. Players without stats (rookies) aren&apos;t counted.
                </p>
              </div>
              {summary && (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {summary.ranks.map((r) => (
                      <div
                        key={r.category}
                        className={cn(
                          "rounded-md border border-border px-3 py-2",
                          activePunts.includes(r.category) && "opacity-50",
                          summary.weakest.some((w) => w.category === r.category) && "border-[var(--red)] bg-[var(--red-soft)]",
                        )}
                      >
                        <p className="text-xs text-muted-foreground">
                          {r.category}
                          {activePunts.includes(r.category) && " · punt"}
                        </p>
                        <p className="font-display text-lg font-bold tabular-nums">
                          {r.rank}
                          <span className="text-xs font-normal text-muted-foreground">/{teamCount}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <p>
                    {summary.weakest.length > 0
                      ? `Weakest: ${summary.weakest.map((w) => w.category).join(", ")}. Target them on waivers.`
                      : "No category in your bottom half outside your punts."}
                  </p>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                {saveResult && "confirm" in saveResult ? (
                  <>
                    <p role="alert" className="w-full text-[var(--amber)]">
                      You already have {saveResult.confirm} player{saveResult.confirm === 1 ? "" : "s"} on your roster. Saving
                      replaces them with your {myPicks.length} draft picks.
                    </p>
                    <Button variant="destructive" onClick={() => saveRoster(true)} disabled={saving}>
                      {saving ? "Saving…" : "Replace my roster"}
                    </Button>
                    <Button variant="outline" onClick={() => setSaveResult(null)} disabled={saving}>
                      Cancel
                    </Button>
                  </>
                ) : saveResult && "success" in saveResult ? (
                  <>
                    <p className="text-[var(--green)]">Saved {saveResult.saved} players as your roster.</p>
                    <Button asChild>
                      <Link href="/matchup">Open Matchup</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => saveRoster(false)} disabled={saving}>
                      {saving ? "Saving…" : "Save as my roster"}
                    </Button>
                    {saveResult && "error" in saveResult && (
                      <p role="alert" className="text-[var(--red)]">
                        {saveResult.error}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Input
                  type="search"
                  placeholder={`Search any player to mark ${myTurn ? "your" : `${teamLabel(onClock)}'s`} pick…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search players"
                />
                <div className="flex flex-wrap gap-1.5">
                  {POSITIONS.map((p) => (
                    <Button key={p} size="sm" variant={position === p ? "default" : "outline"} onClick={() => setPosition(p)} aria-pressed={position === p}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>

              {suggestions.length > 0 && oddsPick !== null && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested for {myTurn ? "this pick" : `your pick #${oddsAt}`}
                  </p>
                  <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                    {suggestions.map((sg) => (
                      <li key={sg.ranked.player.name}>
                        <button
                          type="button"
                          onClick={() => draftPlayer(sg.ranked.player.name)}
                          className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
                        >
                          <span className="block truncate text-sm font-medium">{sg.ranked.player.name}</span>
                          <span className="block text-xs text-muted-foreground">{sg.reason}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Tap a player to mark him drafted by {myTurn ? "you" : teamLabel(onClock)}. Odds = chance he&apos;s still there at
                your next pick{oddsPick ? ` (#${oddsPick})` : ""}, from ESPN ADP.
              </p>

              <ol className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Best available players">
                {available.slice(0, q ? 50 : 200).map((r, i, list) => {
                  const odds = oddsPick ? pAvailable(r.player.adp, null, oddsPick) : null;
                  return (
                    <li key={r.player.name}>
                      {(i === 0 || list[i - 1].tier !== r.tier) && (
                        <p className="border-b border-border bg-muted/40 px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Tier {r.tier}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => draftPlayer(r.player.name)}
                        className="grid w-full grid-cols-[2.25rem_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-accent active:bg-accent"
                      >
                        <span className="text-sm font-bold tabular-nums text-muted-foreground">{r.rank}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.player.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.player.team} · {r.player.positions.join("/") || "–"}
                            {r.lowGp && <span className="ml-1 text-[var(--amber)]">· Low GP</span>}
                            <FlagChip flag={adpFlag(r.rank, adpRankOf.get(r.player.name) ?? null, teamCount)} />
                          </span>
                        </span>
                        <span className="w-12 text-right text-sm font-semibold tabular-nums" title="Value">
                          {r.value.toFixed(2)}
                        </span>
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground" title="ESPN ADP">
                          {r.player.adp?.toFixed(0) ?? "–"}
                        </span>
                        <span className={cn("w-11 text-right text-sm tabular-nums", oddsClass(odds))} title="Chance he's there at your next pick">
                          {pct(odds)}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {unrankedMatches.slice(0, 20).map((u) => {
                  const odds = oddsPick ? pAvailable(u.adp, null, oddsPick) : null;
                  return (
                    <li key={u.name}>
                      <button
                        type="button"
                        onClick={() => draftPlayer(u.name)}
                        className="grid w-full grid-cols-[2.25rem_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-accent"
                      >
                        <span className="text-sm text-muted-foreground">–</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{u.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {u.team} · {u.positions.join("/") || "–"} · No stats last season
                          </span>
                        </span>
                        <span className="w-12 text-right text-sm text-muted-foreground">–</span>
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{u.adp?.toFixed(0) ?? "–"}</span>
                        <span className={cn("w-11 text-right text-sm tabular-nums", oddsClass(odds))}>{pct(odds)}</span>
                      </button>
                    </li>
                  );
                })}
                {available.length === 0 && unrankedMatches.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">No available players match.</li>
                )}
              </ol>
            </>
          )}
        </section>

        <aside className={cn("space-y-4", tab !== "team" && "max-lg:hidden")}>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Category profile</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Your picks&apos; average z-score vs. a typical rostered player (0)</p>
            <div className="mt-3 space-y-1.5">
              {settings.categories.map((c) => {
                const z = profile[c];
                const punted = activePunts.includes(c);
                const width = z == null ? 0 : Math.min(Math.abs(z), 2) * 25; // ±2 fills half the bar
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => togglePunt(c)}
                    aria-pressed={punted}
                    title={punted ? `Un-punt ${c}` : `Punt ${c}`}
                    className="grid w-full grid-cols-[2.5rem_1fr_2.75rem] items-center gap-2 text-left text-xs"
                  >
                    <span className={cn("font-semibold", punted && "text-muted-foreground line-through")}>{c}</span>
                    <span className="relative h-2.5 rounded-full bg-muted">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      {!punted && z != null && (
                        <span
                          className={cn("absolute inset-y-0 rounded-full", z >= 0 ? "left-1/2 bg-[var(--green)]" : "right-1/2 bg-[var(--red)]")}
                          style={{ width: `${width}%` }}
                        />
                      )}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{punted ? "punt" : z!.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Tap a category to punt it; the board re-ranks.</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Open roster slots</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ROSTER_POSITIONS.filter((pos) => settings.rosterSlots[pos] > 0).map((pos) => (
                <span
                  key={pos}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                    needs[pos] > 0 ? "bg-[var(--accent-soft)] text-primary" : "bg-muted text-muted-foreground line-through",
                  )}
                >
                  {pos} {needs[pos]}/{settings.rosterSlots[pos]}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">My picks ({myPicks.length})</h2>
            {myPicks.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No picks yet.</p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {myPicks.map((p) => {
                  const r = byName.get(p.player_name);
                  return (
                    <li key={p.overall_pick} className="flex justify-between gap-2">
                      <span className="truncate">
                        <span className="tabular-nums text-muted-foreground">
                          {roundOf(p.overall_pick, teamCount)}.{((p.overall_pick - 1) % teamCount) + 1}
                        </span>{" "}
                        {p.player_name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{r ? r.value.toFixed(2) : "–"}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <Button variant="ghost" size="sm" className="text-[var(--red)]" onClick={abandon} onBlur={() => setConfirmAbandon(false)}>
            {confirmAbandon ? "Tap again to abandon this draft" : "Abandon draft"}
          </Button>
        </aside>
      </div>
    </div>
  );
}
