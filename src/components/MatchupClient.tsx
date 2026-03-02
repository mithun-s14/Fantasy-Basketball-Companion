"use client";

import { useState, useEffect, useActionState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Swords, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { MatchupProjectionTable } from "@/components/MatchupProjectionTable";
import { computeMatchup } from "@/lib/matchup";
import { NBA_TEAMS } from "@/lib/constants";
import {
  addOpponentPlayer,
  removeOpponentPlayer,
} from "@/app/(main)/matchup/actions";
import type { RosterPlayer, OpponentPlayer, PlayerStats } from "@/lib/types";
import type { MatchupResult } from "@/lib/matchup";

// --------------------------------------------------------------------------
// Shared sub-components (same patterns as RosterClient)
// --------------------------------------------------------------------------

interface PlayerSuggestion {
  name: string;
  team: string;
}

function SelectWithHidden({
  name,
  placeholder,
  externalValue,
}: {
  name: string;
  placeholder: string;
  externalValue?: string;
}) {
  const [value, setValue] = useState(externalValue ?? "");
  useEffect(() => {
    if (externalValue !== undefined) setValue(externalValue);
  }, [externalValue]);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {NBA_TEAMS.map((team) => (
            <SelectItem key={team} value={team}>
              {team}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function PlayerAutocomplete({
  onSelect,
  resetKey,
}: {
  onSelect: (player: PlayerSuggestion) => void;
  resetKey: number;
}) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }, [resetKey]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // C2: cleanup effect — abort any in-flight request on unmount
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  function triggerSearch(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (val.trim().length < 2) { setSuggestions([]); setIsOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(`/api/players?search=${encodeURIComponent(val)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          const list: PlayerSuggestion[] = Array.isArray(data) ? data : [];
          setSuggestions(list);
          setIsOpen(list.length > 0);
          setActiveIndex(-1);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function handleSelect(player: PlayerSuggestion) {
    setInputValue(player.name);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(player);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); handleSelect(suggestions[activeIndex]); }
    else if (e.key === "Escape") setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        name="player_name"
        placeholder="e.g. Jayson Tatum"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); triggerSearch(e.target.value); }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        autoComplete="off"
        required
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="player-autocomplete-listbox"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}
      {isOpen && suggestions.length > 0 && (
        <ul id="player-autocomplete-listbox" role="listbox" className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((player, i) => (
            <li
              key={player.name}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(player); }}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer gap-4 ${i === activeIndex ? "bg-orange-50" : "hover:bg-gray-50"}`}
            >
              <span className="text-sm font-medium text-gray-900">{player.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{player.team}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// I1: removed onSuccess prop — AddOpponentForm handles its own refresh
function AddOpponentForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(addOpponentPlayer, null);
  const [resetKey, setResetKey] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState("");

  // C1: removed onSuccess() call; only state changes + router.refresh()
  useEffect(() => {
    if (state && "success" in state) {
      setResetKey((k) => k + 1);
      setSelectedTeam("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label>Player name</Label>
          <PlayerAutocomplete onSelect={(p) => setSelectedTeam(p.team)} resetKey={resetKey} />
        </div>
        <div className="space-y-1.5" key={resetKey}>
          <Label>NBA team</Label>
          <SelectWithHidden name="nba_team" placeholder="Select team" externalValue={selectedTeam} />
        </div>
        <Button type="submit" disabled={isPending} className="whitespace-nowrap">
          {isPending ? "Adding\u2026" : "Add player"}
        </Button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}

function RemoveOpponentButton({ playerId, onSuccess }: { playerId: string; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(removeOpponentPlayer, null);

  // C1: store onSuccess in a ref to avoid stale closure
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; });

  useEffect(() => {
    if (state && "success" in state) onSuccessRef.current();
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="player_id" value={playerId} />
      <Button type="submit" variant="ghost" size="icon" disabled={isPending}
        aria-label="Remove player"
        className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}

// --------------------------------------------------------------------------
// RosterColumn: renders a player list with optional add form
// --------------------------------------------------------------------------
function RosterColumn({
  title,
  players,
  missingNames,
  showAddForm,
  onRemove,
}: {
  title: string;
  players: (RosterPlayer | OpponentPlayer)[];
  missingNames: Set<string>;
  showAddForm?: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-gray-900">{title}</h2>

      {showAddForm && onRemove && (
        <div className="bg-gray-50 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add player</p>
          {/* I1: removed dead onSuccess={() => {}} prop */}
          <AddOpponentForm />
        </div>
      )}

      {players.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No players yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate">{player.player_name}</p>
                  <p className="text-xs text-gray-500">{player.nba_team}</p>
                </div>
                {missingNames.has(player.player_name) && (
                  // I3: added role="img" for proper ARIA semantics
                  <AlertTriangle role="img" aria-label="No stats available" className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                )}
              </div>
              {showAddForm && onRemove && (
                <RemoveOpponentButton playerId={player.id} onSuccess={() => onRemove(player.id)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// MatchupClient: main exported component
// --------------------------------------------------------------------------
interface Props {
  userPlayers: RosterPlayer[];
  opponentPlayers: OpponentPlayer[];
  allStats: PlayerStats[];
}

export function MatchupClient({ userPlayers, opponentPlayers, allStats }: Props) {
  const router = useRouter();
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [statType, setStatType] = useState<"season" | "last10">("season");
  const [gameCounts, setGameCounts] = useState<Record<string, number>>({});
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [oppPlayers, setOppPlayers] = useState<OpponentPlayer[]>(opponentPlayers);

  // Sync server-refreshed opponentPlayers into local state
  useEffect(() => { setOppPlayers(opponentPlayers); }, [opponentPlayers]);

  // I5: fetch game counts — only clear loading on success or real error, not AbortError
  useEffect(() => {
    if (!startDate || !endDate) { setGameCounts({}); return; }
    const controller = new AbortController();
    setIsLoadingGames(true);
    setGameError(null);
    const s = format(startDate, "yyyy-MM-dd");
    const e = format(endDate, "yyyy-MM-dd");
    fetch(`/api/games?start=${s}&end=${e}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch schedule");
        return res.json();
      })
      .then((data) => {
        setGameCounts(data.gameCounts ?? {});
        setIsLoadingGames(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setGameError(err.message);
          setIsLoadingGames(false);
        }
      });
    return () => controller.abort();
  }, [startDate, endDate]);

  // Compute projection
  const hasLast10Stats = allStats.some((s) => s.stat_type === "last10");
  const effectiveStatType = statType === "last10" && !hasLast10Stats ? "season" : statType;

  const result: MatchupResult | null =
    userPlayers.length > 0 && oppPlayers.length > 0 && !isLoadingGames
      ? computeMatchup(userPlayers, oppPlayers, allStats, gameCounts, effectiveStatType)
      : null;

  // M1: memoize derived Sets to avoid recomputation on every render
  const statNames = useMemo(
    () => new Set(
      allStats.filter((s) => s.stat_type === effectiveStatType).map((s) => s.player_name.normalize("NFC").toLowerCase())
    ),
    [allStats, effectiveStatType]
  );
  const missingUserNames = useMemo(
    () => new Set(
      userPlayers.filter((p) => !statNames.has(p.player_name.normalize("NFC").toLowerCase())).map((p) => p.player_name)
    ),
    [userPlayers, statNames]
  );
  const missingOppNames = useMemo(
    () => new Set(
      oppPlayers.filter((p) => !statNames.has(p.player_name.normalize("NFC").toLowerCase())).map((p) => p.player_name)
    ),
    [oppPlayers, statNames]
  );
  const hasMissing = missingUserNames.size > 0 || missingOppNames.size > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="mb-2">
            <div className="flex items-center gap-3 mb-2">
              <Swords className="w-8 h-8 text-orange-600" />
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Matchup Estimator</h1>
            </div>
            <p className="text-gray-500">
              Compare your roster against {"opponent's"} across 9 H2H categories.
            </p>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Date range</p>
              <DateRangeSelector
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Stats</p>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
                <button
                  onClick={() => setStatType("season")}
                  className={`px-4 py-2 transition-colors ${statType === "season" ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  Season
                </button>
                <button
                  onClick={() => setStatType("last10")}
                  className={`px-4 py-2 transition-colors ${statType === "last10" ? "bg-orange-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  title={!hasLast10Stats ? "Last 10 stats not yet available \u2014 using season averages" : undefined}
                >
                  Last 10
                  {!hasLast10Stats && <span className="ml-1 text-xs opacity-60">(N/A)</span>}
                </button>
              </div>
            </div>
          </div>

          {gameError && (
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-800">{gameError}</p>
            </div>
          )}

          {hasMissing && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-800">
                Some players are missing stats (shown with warning icon). Totals for those rosters are incomplete.
                Stats update daily — check back tomorrow if a player was recently added.
              </p>
            </div>
          )}

          {/* Two-column rosters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RosterColumn
              title="Your Roster"
              players={userPlayers}
              missingNames={missingUserNames}
            />
            <RosterColumn
              title={"Opponent's Roster"}
              players={oppPlayers}
              missingNames={missingOppNames}
              showAddForm
              onRemove={(id) => {
                setOppPlayers((prev) => prev.filter((p) => p.id !== id));
                router.refresh();
              }}
            />
          </div>

          {/* Projection table */}
          {result ? (
            <MatchupProjectionTable result={result} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-500">
              {allStats.length === 0
                ? "No player stats available yet. Stats are seeded daily — check back tomorrow."
                : userPlayers.length === 0 || oppPlayers.length === 0
                ? "Add players to both rosters to see the projection."
                : "Loading game schedule\u2026"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
