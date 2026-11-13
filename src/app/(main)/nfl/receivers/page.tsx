import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { COLUMNS as ALIGN_COLUMNS, loadReceivers, RECEIVERS_URL, USAGE_COLUMNS, type ReceiverKey, type UsageKey } from "@/nfl/receivers";

// Each "Opp ... allowed" alignment column sits right after the player's own PPG for that alignment.
const OPP_ALIGN = { slot_ppg: "opp_slot_ppg", wide_ppg: "opp_wide_ppg" } as const;
const COLUMNS = [
  ...ALIGN_COLUMNS.flatMap((c) => {
    const opp = USAGE_COLUMNS.find(([k]) => k === OPP_ALIGN[c[0] as keyof typeof OPP_ALIGN]);
    return opp ? [c, opp] : [c];
  }),
  ...USAGE_COLUMNS.filter(([k]) => !Object.values(OPP_ALIGN).includes(k as never)),
];
type Key = ReceiverKey | UsageKey;

const fmt = (key: Key, v: number | null) =>
  v == null ? "—" : key.endsWith("_pct") ? `${v.toFixed(0)}%` : key === "games" ? v.toFixed(0) : v.toFixed(1);

export default async function ReceiversPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; q?: string }>;
}) {
  const params = await searchParams;
  const sort: Key = COLUMNS.find(([k]) => k === params.sort)?.[0] ?? "slot_pct";
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
      ? "The nfl_receiver_alignment table or its columns are missing. Run sql/nfl/nfl_receiver_alignment.sql in Supabase, then npm run nfl:scrape-receivers."
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
            Fantasy points per game from the slot vs out wide, this season. Slot/wide share = share of the player&apos;s
            points, not snaps. Opp slot/wide allowed = PPR points per game this week&apos;s opponent allows to WRs from
            that alignment (Razzball). Usage (snap %, targets, target and air yards share) and this week&apos;s matchup (Vegas
            implied team total, PPR points the defense allows to WRs per game) from{" "}
            <a href="https://github.com/nflverse" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              nflverse
            </a>{" "}
            ·{" "}
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
                  <TableHead className="text-xs uppercase tracking-wider">Opp</TableHead>
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
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.opp ?? (r.tgt_pg == null ? "—" : "BYE")}</TableCell>
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
