import type { MatchupResult } from "@/lib/matchup";

function formatStat(category: string, value: number): string {
  if (category === "fg_pct" || category === "ft_pct") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(1);
}

interface Props {
  result: MatchupResult;
}

export function MatchupProjectionTable({ result }: Props) {
  const { categories, userWins, opponentWins } = result;

  const overallLabel =
    userWins > opponentWins
      ? `You lead ${userWins}–${opponentWins}`
      : userWins < opponentWins
      ? `Opponent leads ${opponentWins}–${userWins}`
      : `Tied ${userWins}–${opponentWins}`;

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border overflow-hidden">
      {/* Overall score header */}
      <div className="px-5 py-4 bg-gradient-to-r from-primary/15 to-transparent border-b border-border flex items-center justify-between">
        <h3 className="font-display text-xl font-bold uppercase tracking-wide">Matchup Projection</h3>
        <span className="font-display text-2xl font-bold uppercase text-primary tabular-nums">{overallLabel}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16">Category</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">You</th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground w-12"></th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opponent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {categories.map(({ category, label, userTotal, opponentTotal, winner }) => (
            <tr key={category} className="hover:bg-accent/50 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground/90">{label}</td>
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  winner === "user" ? "text-emerald-300" : "text-muted-foreground"
                }`}
              >
                {formatStat(category, userTotal)}
              </td>
              <td className="px-4 py-3 text-center text-muted-foreground text-xs" aria-label="vs">vs</td>
              <td
                className={`px-4 py-3 tabular-nums font-medium ${
                  winner === "opponent" ? "text-emerald-300" : "text-muted-foreground"
                }`}
              >
                {formatStat(category, opponentTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
