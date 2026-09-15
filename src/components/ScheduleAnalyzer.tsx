"use client";

import { useState, useEffect } from "react";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { TeamFilter } from "@/components/TeamFilter";
import { TeamScheduleTable } from "@/components/TeamScheduleTable";
import { NBA_TEAMS } from "@/lib/constants";
import { Loader2 } from "lucide-react";
import { PageHeader, StatTile } from "@/components/PageHeader";
import { format } from "date-fns";

export default function ScheduleAnalyzer() {
  const [startDate, setStartDate] = useState<Date | undefined>(new Date()); // Grab today's date as default start
  // Set end date to 7 days from today
  const [endDate, setEndDate] = useState<Date | undefined>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [gameCounts, setGameCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set(NBA_TEAMS));

  useEffect(() => {
    if (!startDate || !endDate) {
      setGameCounts(new Map());
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");

    fetch(`/api/games?start=${startStr}&end=${endStr}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch schedule data");
        return res.json();
      })
      .then((data) => {
        // Initialize all teams to 0, then overlay API data
        const counts = new Map<string, number>();
        NBA_TEAMS.forEach((team) => counts.set(team, 0));
        for (const [team, count] of Object.entries(data.gameCounts)) {
          counts.set(team, count as number);
        }
        setGameCounts(counts);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [startDate, endDate]);

  const visible = [...gameCounts].filter(([team]) => selectedTeams.has(team));
  const totalGames = visible.reduce((sum, [, c]) => sum + c, 0);
  const avg = visible.length ? (totalGames / visible.length).toFixed(1) : "0.0";
  const top = visible.reduce<[string, number] | null>((best, row) => (!best || row[1] > best[1] ? row : best), null);
  const sitCount = visible.filter(([, c]) => c < 2).length;

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title="Schedule Analyzer"
        description="Games per NBA team in a date range — find streamers and plan lineup moves."
      />

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-end">
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <TeamFilter
          selectedTeams={selectedTeams}
          onSelectedTeamsChange={setSelectedTeams}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Teams shown" value={visible.length} hint={`of ${gameCounts.size || 30}`} />
        <StatTile label="Avg games / team" value={avg} hint="In selected range" />
        <StatTile label="Most games" value={top?.[1] ?? 0} hint={top && top[1] > 0 ? top[0] : "—"} />
        <StatTile label="Teams with 0–1" value={sitCount} hint="Consider sitting" />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-rose-300">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <TeamScheduleTable
          gameCounts={gameCounts}
          startDate={startDate}
          endDate={endDate}
          selectedTeams={selectedTeams}
        />
      )}
    </div>
  );
}
