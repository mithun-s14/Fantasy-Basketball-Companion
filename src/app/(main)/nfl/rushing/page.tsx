import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SearchInput } from "../receivers/SearchInput";
import { loadRushers, RUSH_COLUMNS as COLUMNS, RUSH_DEFENSE_URL, RUSHERS_URL, type RushKey } from "@/nfl/rushing";

const fmt = (key: RushKey, v: number | null) =>
  v == null ? "—" : key.endsWith("_pct") ? `${v.toFixed(0)}%` : key.endsWith("_ypg") ? v.toFixed(1) : v.toFixed(0);
const link = "underline hover:text-foreground";

export default async function RushingPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; q?: string }>;
}) {
  const params = await searchParams;
  const sort: RushKey = COLUMNS.find(([k]) => k === params.sort)?.[0] ?? "total_att";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const q = params.q?.trim() ?? "";

  let rows: Awaited<ReturnType<typeof loadRushers>> = [];
  let error: string | null = null;
  try {
    rows = (await loadRushers()).sort((a, b) => (dir === "asc" ? 1 : -1) * ((a[sort] ?? -1) - (b[sort] ?? -1)));
    if (!rows.length) error = "No rushing data yet. Run npm run nfl:scrape-receivers.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = /nfl_rb_zone_gap/.test(msg)
      ? "The nfl_rb_zone_gap table is missing. Run sql/nfl/nfl_rb_zone_gap.sql in Supabase, then npm run nfl:scrape-receivers."
      : msg;
  }
  const scrapedAt = rows.map((r) => r.scraped_at).sort().pop();
  const shown = rows.map((r, i) => ({ ...r, rank: i + 1 })).filter((r) => r.player.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader />

      {error ? (
        <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            RB rush attempts on zone vs gap (power/man) run concepts this season; zone % + gap % can miss 100 by the
            &ldquo;other&rdquo; runs. Opp zone/gap allowed = rushing yards per game this week&apos;s opponent gives up on
            that concept. Data from Razzball:{" "}
            <a href={RUSHERS_URL} target="_blank" rel="noreferrer" className={link}>
              RB zone vs gap
            </a>{" "}
            ·{" "}
            <a href={RUSH_DEFENSE_URL} target="_blank" rel="noreferrer" className={link}>
              team defense
            </a>
            {scrapedAt && ` · scraped ${new Date(scrapedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </div>
          <div className="border-b border-border px-4 py-3">
            <SearchInput />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Team</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Opp</TableHead>
                  {COLUMNS.map(([key, label], i) => (
                    <TableHead
                      key={key}
                      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("text-right text-xs uppercase tracking-wider", i === COLUMNS.length - 1 && "pr-5")}
                    >
                      <Link
                        href={`?${new URLSearchParams({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc", ...(q && { q }) })}`}
                        scroll={false}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === key && "text-primary")}
                      >
                        {label}
                        {sort === key && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </Link>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!shown.length && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + 4} className="py-8 text-center text-sm text-muted-foreground">
                      No players match &ldquo;{q}&rdquo;.
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((r) => (
                  <TableRow key={r.player}>
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">{r.rank}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.player}</TableCell>
                    <TableCell className="text-muted-foreground">{r.team}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.opp ?? "—"}</TableCell>
                    {COLUMNS.map(([key], j) => (
                      <TableCell
                        key={key}
                        className={cn("text-right tabular-nums", j === COLUMNS.length - 1 && "pr-5", sort === key && "font-semibold")}
                      >
                        {fmt(key, r[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
