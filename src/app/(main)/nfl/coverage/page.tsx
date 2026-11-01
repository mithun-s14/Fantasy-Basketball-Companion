import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { COLUMNS, COVERAGE_URL, type CoverageKey, loadCoverage, TENDENCIES_URL } from "@/nfl/coverage";

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sort: CoverageKey = COLUMNS.find(([k]) => k === params.sort)?.[0] ?? "man_rate";
  const dir = params.dir === "asc" ? "asc" : "desc";

  let rows: Awaited<ReturnType<typeof loadCoverage>> = [];
  let error: string | null = null;
  try {
    rows = (await loadCoverage()).sort((a, b) => (dir === "asc" ? 1 : -1) * ((a[sort] ?? -1) - (b[sort] ?? -1)));
    if (!rows.length) error = "No coverage data yet. Run npm run nfl:scrape-coverage.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = /nfl_coverage_schemes/.test(msg)
      ? "The nfl_coverage_schemes table doesn't exist yet. Run sql/nfl/nfl_coverage_schemes.sql in Supabase."
      : msg;
  }
  const scrapedAt = rows.map((r) => r.scraped_at).sort().pop();

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader />

      {error ? (
        <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            Share of defensive snaps, this season ·{" "}
            <a href={COVERAGE_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              Sharp coverage schemes
            </a>{" "}
            &amp;{" "}
            <a href={TENDENCIES_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              defensive tendencies
            </a>
            {scrapedAt && ` · scraped ${new Date(scrapedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Defense</TableHead>
                  {COLUMNS.map(([key, label], i) => (
                    <TableHead
                      key={key}
                      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("text-right text-xs uppercase tracking-wider", i === COLUMNS.length - 1 && "pr-5")}
                    >
                      {/* First click sorts highest first; clicking the active column flips it. */}
                      <Link
                        href={`?${new URLSearchParams({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc" })}`}
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
                {rows.map((r, i) => (
                  <TableRow key={r.team}>
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.team}</TableCell>
                    {COLUMNS.map(([key], j) => (
                      <TableCell
                        key={key}
                        className={cn("text-right tabular-nums", j === COLUMNS.length - 1 && "pr-5", sort === key && "font-semibold")}
                      >
                        {r[key] == null ? "—" : `${r[key]!.toFixed(1)}%`}
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
