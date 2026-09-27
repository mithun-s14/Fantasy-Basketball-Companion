import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BASES, type Basis, fetchWeekMatchups, loadKickerStats, rankKickers } from "@/nfl/kickers";

const kickoffFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

// Sortable numeric columns. Default is edge, highest first.
const SORTS = ["teamFga", "oppFgmAllowed", "edge"] as const;
type Sort = (typeof SORTS)[number];

export default async function KickersPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const basis: Basis = params.basis && params.basis in BASES ? (params.basis as Basis) : "season_avg";
  const sort: Sort = SORTS.includes(params.sort as Sort) ? (params.sort as Sort) : "edge";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const href = (p: { basis?: Basis; sort?: Sort; dir?: string }) =>
    `?${new URLSearchParams({ basis, sort, dir, ...p })}`;

  let week = 0;
  let picks: ReturnType<typeof rankKickers> = [];
  let error: string | null = null;
  try {
    const [{ week: w, matchups }, stats] = await Promise.all([fetchWeekMatchups(), loadKickerStats()]);
    week = w;
    picks = rankKickers(matchups, stats, basis).sort((a, b) => (dir === "asc" ? 1 : -1) * (a[sort] - b[sort]));
    if (!stats.length) error = "No kicker stats yet. Run npm run nfl:scrape-team-stats.";
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load kicker data.";
  }

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        actions={
          <div role="group" aria-label="Stat basis" className="flex rounded-md border border-border p-0.5">
            {(Object.keys(BASES) as Basis[]).map((b) => (
              <Link
                key={b}
                href={href({ basis: b })}
                aria-current={b === basis ? "true" : undefined}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  b === basis ? "bg-[var(--accent-soft)] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {BASES[b]}
              </Link>
            ))}
          </div>
        }
      />

      {error ? (
        <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            Week {week} · Edge = opponent FG made allowed/game − team FG attempts/game ({BASES[basis].toLowerCase()})
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Kicker (team)</TableHead>
                  {(
                    [
                      ["teamFga", "Team FGA", ""],
                      ["oppFgmAllowed", "Opp FGM allowed", ""],
                      ["edge", "Edge", "pr-5"],
                    ] as const
                  ).map(([key, label, pad]) => (
                    <TableHead
                      key={key}
                      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("text-right text-xs uppercase tracking-wider", pad)}
                    >
                      {/* First click sorts highest first; clicking the active column flips it. */}
                      <Link
                        href={href({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" })}
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
                {picks.map((p, i) => (
                  <TableRow key={p.team}>
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium">{p.team}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.home ? "vs" : "@"} {p.opponent} · {kickoffFmt.format(new Date(p.kickoff))} ET
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.teamFga.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.oppFgmAllowed.toFixed(2)}</TableCell>
                    <TableCell
                      className={cn(
                        "pr-5 text-right font-semibold tabular-nums",
                        p.edge > 0 ? "text-[var(--green)]" : p.edge < 0 ? "text-[var(--red)]" : "text-muted-foreground",
                      )}
                    >
                      {p.edge > 0 ? "+" : ""}
                      {p.edge.toFixed(2)}
                    </TableCell>
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
