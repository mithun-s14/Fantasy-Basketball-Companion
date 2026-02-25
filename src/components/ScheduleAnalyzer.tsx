"use client";

import { useState, useEffect } from "react";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { TeamFilter } from "@/components/TeamFilter";
import { TeamScheduleTable } from "@/components/TeamScheduleTable";
import { NBA_TEAMS } from "@/lib/constants";
import { Activity, Loader2 } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold">Fantasy Basketball Schedule Analyzer</h1>
          </div>
          <p className="text-gray-600">
            Select a date range to see how many times an NBA team plays during that period, helping you optimize your fantasy lineup and free agency pick ups.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Select Date Range</h2>
          <DateRangeSelector
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <div className="mt-4">
            <TeamFilter
              selectedTeams={selectedTeams}
              onSelectedTeamsChange={setSelectedTeams}
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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
      </div>
    </div>
  );
}
