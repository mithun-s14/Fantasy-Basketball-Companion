import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TeamScheduleTableProps {
  gameCounts: Map<string, number>;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedTeams: Set<string>;
}

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

  const totalGames = sortedTeams.reduce((sum, [, count]) => sum + count, 0) / 2;

  if (!startDate || !endDate) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Schedule Analysis</CardTitle>
          <CardDescription>Select a date range to view game counts</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Number of Games per Team between {startDate?.toLocaleDateString()} and {endDate?.toLocaleDateString()}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12.5">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Games</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTeams.map(([team, count], index) => (
                <TableRow key={team}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{team}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                        count >= 7
                          ? "bg-green-100 text-green-800"
                          : count >= 4
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {count}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Colour legend for number of games */}
        {/* <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-green-100"></span>
            <span>7+ games</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-yellow-100"></span>
            <span>4-6 games</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-red-100"></span>
            <span>0-3 games</span>
          </div>
        </div> */}
      </CardContent>
    </Card>
  );
}
