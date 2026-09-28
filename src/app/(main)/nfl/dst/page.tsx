import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { COLUMNS, DEFAULT_SORT, type DstDoc, PRESETS, type Preset, loadDstDoc, sortTeams } from "@/nfl/dst";

type Params = { scoring?: string; sort?: string; dir?: string; home?: string; flag?: string };

const chip = (active: boolean) =>
  cn(
    "rounded px-2.5 py-1 text-sm",
    active ? "bg-[var(--accent-soft)] text-foreground" : "text-muted-foreground hover:text-foreground",
  );

export default async function DstPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const preset: Preset = params.scoring && params.scoring in PRESETS ? (params.scoring as Preset) : "espn_default";
  const col = COLUMNS.find((c) => c.key === params.sort) ?? COLUMNS.find((c) => c.key === DEFAULT_SORT)!;
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : col.lowFirst ? "asc" : "desc";
  const homeOnly = params.home === "1";

  let doc: DstDoc | null = null;
  let error: string | null = null;
  try {
    doc = await loadDstDoc(preset);
    if (!doc) error = "No D/ST data published yet. Run `uv run streamer build --publish` in nfl/dst-streamer.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = /nfl_dst_rankings/.test(msg)
      ? "The nfl_dst_rankings table doesn't exist yet. Run sql/nfl/nfl_dst_rankings.sql in Supabase."
      : msg;
  }
  const rules = Object.fromEntries((doc?.flag_legend ?? []).map((e) => [e.flag, e.rule]));
  const flag = params.flag && params.flag in rules ? params.flag : null;

  const href = (p: Partial<Params>) => {
    const q = { scoring: preset, sort: col.key, dir, home: homeOnly ? "1" : "", flag: flag ?? "", ...p };
    return `?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`;
  };

  const teams = doc
    ? sortTeams(
        doc.teams.filter((t) => (!homeOnly || t.is_home) && (!flag || t.flags.includes(flag))),
        col.key,
        dir,
      )
    : [];
  // Header groups: consecutive columns sharing a group get one spanning cell.
  const groups = COLUMNS.reduce<{ name: string; span: number }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last?.name === c.group) last.span++;
    else acc.push({ name: c.group, span: 1 });
    return acc;
  }, []);

  return (
    <div className="w-full min-w-0 space-y-4 px-4 py-6 sm:px-6">
      <PageHeader
        actions={
          <div role="group" aria-label="Scoring" className="flex rounded-md border border-border p-0.5">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <Link key={p} href={href({ scoring: p })} aria-current={p === preset ? "true" : undefined} className={chip(p === preset)}>
                {PRESETS[p]}
              </Link>
            ))}
          </div>
        }
      />

      {error || !doc ? (
        <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <span>
                {doc.season} week {doc.week} · updated {new Date(doc.generated_at_utc).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET · {teams.length} D/STs
              </span>
              <Link href={href({ home: homeOnly ? "" : "1" })} scroll={false} aria-pressed={homeOnly} className={chip(homeOnly)}>
                Home only
              </Link>
            </div>
            <nav aria-label="Filter by flag" className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
              <Link href={href({ flag: "" })} scroll={false} aria-current={!flag ? "true" : undefined} className={chip(!flag)}>
                All
              </Link>
              {doc.flag_legend.map(({ flag: f }) => (
                <Link key={f} href={href({ flag: f })} scroll={false} title={rules[f]} aria-current={f === flag ? "true" : undefined} className={cn(chip(f === flag), "font-mono text-xs")}>
                  {f}
                </Link>
              ))}
            </nav>

            {/* The table scrolls sideways inside its card; the page itself never does. */}
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-card">
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-30 bg-card" />
                    {groups.map((g) => (
                      <th key={g.name} colSpan={g.span} className="border-b border-l border-border px-2 pt-2 pb-1 text-left font-semibold">
                        {g.name}
                      </th>
                    ))}
                    <th className="border-b border-l border-border" />
                  </tr>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="sticky left-0 z-30 bg-card px-3 py-2 text-left font-medium">D/ST</th>
                    {COLUMNS.map((c) => {
                      const active = c.key === col.key;
                      const firstDir = c.lowFirst ? "asc" : "desc";
                      const nextDir = active ? (dir === "asc" ? "desc" : "asc") : firstDir;
                      return (
                        <th key={c.key} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-2 py-2 font-medium", c.key === "qb" ? "text-left" : "text-right")}>
                          <Link href={href({ sort: c.key, dir: nextDir })} scroll={false} title={c.title} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-primary")}>
                            {c.label}
                            {active && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                          </Link>
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-left font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.team} className="border-b border-border last:border-0 hover:bg-[var(--surface-hover)]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2">
                        <p className="font-semibold">{t.team}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.is_home ? "vs" : "@"} {t.opponent}
                        </p>
                      </td>
                      {COLUMNS.map((c) => {
                        const v = c.get(t);
                        const rank = c.rank?.(t);
                        const qbNote =
                          c.key === "qb" && t.opp_qb.status && t.opp_qb.status !== "Active" ? ` (${t.opp_qb.status})` : "";
                        const lowSample = c.key.startsWith("qb_") && c.key !== "qb_starts" && t.opp_qb.low_sample && t.opp_qb.last_season;
                        return (
                          <td
                            key={c.key}
                            title={
                              lowSample
                                ? `Low sample. Last season: ${t.opp_qb.last_season!.dropbacks ?? 0} dropbacks, sack ${((t.opp_qb.last_season!.sack_rate ?? 0) * 100).toFixed(1)}%, INT ${((t.opp_qb.last_season!.int_rate ?? 0) * 100).toFixed(1)}%`
                                : undefined
                            }
                            className={cn(
                              "whitespace-nowrap px-2 py-2 tabular-nums",
                              c.key === "qb" ? "text-left" : "text-right",
                              c.key === col.key && "text-primary",
                              lowSample && "text-muted-foreground italic",
                            )}
                          >
                            {c.format(v, t)}
                            {qbNote && <span className="text-xs text-[var(--amber)]">{qbNote}</span>}
                            {typeof rank === "number" && <span className="ml-1 text-[10px] text-muted-foreground">#{rank}</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {t.flags.map((f) => (
                            <span key={f} title={rules[f]} className="whitespace-nowrap rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            <h2 className="mb-2 text-sm font-semibold text-foreground">Flags</h2>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {doc.flag_legend.map(({ flag: f, rule }) => (
                <div key={f} className="flex gap-2">
                  <dt className="font-mono text-foreground">{f}</dt>
                  <dd>{rule}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3">
              #N is the league rank, 1 = most favorable for the D/ST. Italic QB rates are a small sample (under 50 dropbacks); hover for last season. Flags are informational and never change the sort.
              Data: nflverse, ESPN (lines), Sleeper.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
