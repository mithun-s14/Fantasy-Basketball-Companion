import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { COLUMNS, loadReceivers, RECEIVERS_URL, type ReceiverKey } from "@/nfl/receivers";

const fmt = (key: ReceiverKey, v: number | null) =>
  v == null ? "—" : key.endsWith("_pct") ? `${v.toFixed(0)}%` : key === "games" ? v.toFixed(0) : v.toFixed(1);

export default async function ReceiversPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; q?: string }>;
}) {
  const params = await searchParams;
  const sort: ReceiverKey = COLUMNS.find(([k]) => k === params.sort)?.[0] ?? "slot_pct";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const q = params.q?.trim() ?? "";

  let rows: Awaited<ReturnType<typeof loadReceivers>> = [];
  let error: string | null = null;
  try {
    rows = (await loadReceivers()).sort((a, b) => (dir === "asc" ? 1 : -1) * ((a[sort] ?? -1) - (b[sort] ?? -1)));
    if (!rows.length) error = "No receiver data yet. Run npm run nfl:scrape-receivers.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = /nfl_receiver_alignment/.test(msg)
      ? "The nfl_receiver_alignment table doesn't exist yet. Run sql/nfl/nfl_receiver_alignment.sql in Supabase."
      : msg;
  }
  const scrapedAt = rows.map((r) => r.scraped_at).sort().pop();
  // Keep each player's overall rank while filtering.
  const shown = rows.map((r, i) => ({ ...r, rank: i + 1 })).filter((r) => r.player.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader />

      {error ? (
        <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            Fantasy points per game from the slot vs out wide, this season. Share = share of the player&apos;s points, not
            snaps ·{" "}
            <a href={RECEIVERS_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              Razzball
            </a>
            {scrapedAt && ` · scraped ${new Date(scrapedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </div>
          <form className="border-b border-border px-4 py-3">
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
            <Input type="search" name="q" defaultValue={q} placeholder="Search player…" aria-label="Search players" className="sm:w-60" />
          </form>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Player</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Team</TableHead>
                  {COLUMNS.map(([key, label], i) => (
                    <TableHead
                      key={key}
                      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("text-right text-xs uppercase tracking-wider", i === COLUMNS.length - 1 && "pr-5")}
                    >
                      {/* First click sorts highest first; clicking the active column flips it. */}
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
                    <TableCell colSpan={COLUMNS.length + 3} className="py-8 text-center text-sm text-muted-foreground">
                      No players match &ldquo;{q}&rdquo;.
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((r) => (
                  <TableRow key={r.player}>
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">{r.rank}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.player}</TableCell>
                    <TableCell className="text-muted-foreground">{r.team}</TableCell>
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
