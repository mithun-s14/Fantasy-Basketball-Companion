"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

// Served from public/projections-2026-27.csv
const CSV_URL = "/projections-2026-27.csv";

type Row = Record<string, string>;

// key = CSV column; stats with a `prev` get low/high/last-season in the hover tooltip.
const STATS: { key: string; label: string; prev?: string; low?: string; high?: string; digits: number; pct?: boolean }[] = [
  { key: "pred_gp", label: "GP", low: "pred_gp_low", high: "pred_gp_high", prev: "gp_prev", digits: 0 },
  { key: "pred_min", label: "MIN", low: "pred_min_low", high: "pred_min_high", prev: "min_prev", digits: 1 },
  { key: "pred_pts", label: "PTS", low: "pred_pts_low", high: "pred_pts_high", prev: "pts_prev", digits: 1 },
  { key: "pred_reb", label: "REB", low: "pred_reb_low", high: "pred_reb_high", prev: "reb_prev", digits: 1 },
  { key: "pred_ast", label: "AST", low: "pred_ast_low", high: "pred_ast_high", prev: "ast_prev", digits: 1 },
  { key: "pred_stl", label: "STL", low: "pred_stl_low", high: "pred_stl_high", prev: "stl_prev", digits: 1 },
  { key: "pred_blk", label: "BLK", low: "pred_blk_low", high: "pred_blk_high", prev: "blk_prev", digits: 1 },
  { key: "pred_fg3m", label: "3PM", low: "pred_fg3m_low", high: "pred_fg3m_high", prev: "fg3m_prev", digits: 1 },
  { key: "pred_tov", label: "TOV", low: "pred_tov_low", high: "pred_tov_high", prev: "tov_prev", digits: 1 },
  { key: "pred_fg_pct", label: "FG%", digits: 1, pct: true },
  { key: "pred_ft_pct", label: "FT%", digits: 1, pct: true },
  { key: "value_total", label: "9-Cat", digits: 2 },
  { key: "value_points_league", label: "Pts Lg", digits: 1 },
];
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C"];

const fmt = (v: string | undefined, digits: number, pct = false) => {
  const n = Number(v);
  if (v === undefined || v === "" || Number.isNaN(n)) return "–";
  return pct ? (n * 100).toFixed(digits) : n.toFixed(digits);
};

export default function ProjectionsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("All");
  const [sort, setSort] = useState({ key: "value_total", desc: true });

  useEffect(() => {
    fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load projections (${res.status})`);
        return res.text();
      })
      .then((text) => {
        const [headers, ...body] = parseCsv(text);
        setRows(body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (position === "All" || r.position === position) &&
        (!q || r.player.toLowerCase().includes(q) || r.team_prev.toLowerCase().includes(q)),
    );
    const { key, desc } = sort;
    return filtered.sort((a, b) => {
      const cmp = key === "player" ? a.player.localeCompare(b.player) : (Number(a[key]) || 0) - (Number(b[key]) || 0);
      return desc ? -cmp : cmp;
    });
  }, [rows, query, position, sort]);

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "player" }));

  const SortHeader = ({ k, label, className }: { k: string; label: string; className?: string }) => (
    <TableHead className={cn("whitespace-nowrap text-xs uppercase tracking-wider", className)}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === k && "text-primary")}
      >
        {label}
        {sort.key === k && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="2026–27 Projections"
        description="Model-projected per-game stats. Hover a stat for its range and last season. Click a column to sort."
        actions={
          rows && (
            <div className="flex gap-2">
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
                className="sm:w-60"
                aria-label="Search projections"
              />
            </div>
          )
        }
      />

      {error && <p className="rounded-lg border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{error}</p>}
      {!rows && !error && <p className="text-sm text-muted-foreground">Loading projections…</p>}

      {rows && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            {visible.length} of {rows.length} players
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5 text-xs uppercase tracking-wider">#</TableHead>
                  <SortHeader k="player" label="Player" />
                  {STATS.map((s) => (
                    <SortHeader key={s.key} k={s.key} label={s.label} className="text-right" />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r, i) => (
                  <TableRow key={r.player_id}>
                    <TableCell className="pl-5 font-display text-base font-bold text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium">{r.player}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.team_prev} · {r.position} · {fmt(r.age, 0)} yrs
                        {r.team_changed === "1" && (
                          <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold text-primary ring-1 ring-primary/30">
                            New team
                          </span>
                        )}
                      </p>
                    </TableCell>
                    {STATS.map((s) => (
                      <TableCell
                        key={s.key}
                        title={
                          s.low
                            ? `Range ${fmt(r[s.low], s.digits)}–${fmt(r[s.high!], s.digits)} · Last season ${fmt(r[s.prev!], s.digits)}`
                            : undefined
                        }
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          s.key.startsWith("value") && "font-semibold",
                          sort.key === s.key && "text-primary",
                        )}
                      >
                        {fmt(r[s.key], s.digits, s.pct)}
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
