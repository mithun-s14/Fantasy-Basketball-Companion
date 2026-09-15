import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gameTierClass } from "@/lib/utils";

interface TeamScheduleTableProps {
  gameCounts: Map<string, number>;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedTeams: Set<string>;
}

const LEGEND = [
  { games: 4, label: "4+ Start" },
  { games: 2, label: "2–3 OK" },
  { games: 0, label: "0–1 Sit" },
];

export function TeamScheduleTable({ gameCounts, startDate, endDate, selectedTeams }: TeamScheduleTableProps) {
  // Convert map to sorted array, filtered by selected teams
  const sortedTeams = Array.from(gameCounts.entries())
    .filter(([team]) => selectedTeams.has(team))
    .sort((a, b) => {
      // Sort by game count desc, then by team name asc
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    });

  if (!startDate || !endDate) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-10 text-center">
        <p className="font-display text-xl font-bold uppercase">Schedule Analysis</p>
        <p className="mt-1 text-sm text-muted-foreground">Select a date range to view game counts</p>
      </div>
    );
  }

  const maxGames = Math.max(1, ...sortedTeams.map(([, c]) => c));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Games per team</h2>
          <p className="text-xs text-muted-foreground">
            {format(startDate, "MMM d")} – {format(endDate, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          {LEGEND.map((l) => (
            <span key={l.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${gameTierClass(l.games)}`}>
              {l.label}
            </span>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-14 pl-5 text-xs uppercase tracking-wider">Rank</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Team</TableHead>
            <TableHead className="pr-5 text-right text-xs uppercase tracking-wider">Games</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTeams.map(([team, count], index) => (
            <TableRow key={team}>
              <TableCell className="pl-5 font-display text-lg font-bold text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell>
                <p className="font-medium">{team}</p>
                <div className="mt-1.5 hidden h-1 max-w-xs rounded-full bg-secondary sm:block">
                  <div className="h-1 rounded-full bg-primary/70" style={{ width: `${(count / maxGames) * 100}%` }} />
                </div>
              </TableCell>
              <TableCell className="pr-5 text-right">
                <span
                  className={`inline-flex min-w-9 items-center justify-center rounded-md px-2 py-1 font-display text-lg font-bold leading-none tabular-nums ring-1 ${gameTierClass(count)}`}
                >
                  {count}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
