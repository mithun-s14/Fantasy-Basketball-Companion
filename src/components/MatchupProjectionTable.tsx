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
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Overall score header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Matchup Projection</h3>
        <span className="text-sm font-semibold text-orange-600">{overallLabel}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-left font-medium text-gray-500 w-16">Category</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">You</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 w-12"></th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Opponent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {categories.map(({ category, label, userTotal, opponentTotal, winner }) => (
            <tr key={category} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-700">{label}</td>
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  winner === "user" ? "text-green-600" : "text-gray-700"
                }`}
              >
                {formatStat(category, userTotal)}
              </td>
              <td className="px-4 py-3 text-center text-gray-400 text-xs">vs</td>
              <td
                className={`px-4 py-3 tabular-nums font-medium ${
                  winner === "opponent" ? "text-green-600" : "text-gray-700"
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
