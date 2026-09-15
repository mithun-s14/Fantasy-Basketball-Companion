"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Users, Trash2 } from "lucide-react";
import { PageHeader, Panel, StatTile } from "@/components/PageHeader";
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
import { addPlayer, removePlayer } from "@/app/(main)/roster/actions";
import { NBA_TEAMS } from "@/lib/constants";
import type { RosterPlayer } from "@/lib/types";

interface PlayerSuggestion {
  name: string;
  team: string;
}

// Syncs a shadcn Select's value into a hidden input inside the form boundary.
// Radix UI portals the dropdown outside the form, so native FormData misses it.
// Accepts an optional externalValue to programmatically set the selection (e.g. from autocomplete).
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
    if (externalValue !== undefined) {
      setValue(externalValue);
    }
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

// Autocomplete input that searches active NBA players via /api/players.
// Exposes a hidden <input name="player_name"> for FormData, and calls onSelect
// so the parent can auto-fill the team dropdown.
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset when the parent form resets (successful submit)
  useEffect(() => {
    setInputValue("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }, [resetKey]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function triggerSearch(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/players?search=${encodeURIComponent(val)}`
        );
        if (res.ok) {
          const data = await res.json();
          const list: PlayerSuggestion[] = Array.isArray(data) ? data : [];
          setSuggestions(list);
          setIsOpen(list.length > 0);
          setActiveIndex(-1);
        }
      } catch {
        // silently ignore network errors during search
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    triggerSearch(val);
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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* This input drives FormData — its value is the typed/selected player name */}
      <Input
        name="player_name"
        placeholder="e.g. LeBron James"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        autoComplete="off"
        required
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      />

      {/* Spinner */}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-2xl overflow-hidden"
        >
          {suggestions.map((player, i) => (
            <li
              key={player.name}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                // Prevent input blur before the click registers
                e.preventDefault();
                handleSelect(player);
              }}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer gap-4 ${
                i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="text-sm font-medium text-foreground">
                {player.name}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {player.team}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddPlayerForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(addPlayer, null);
  const [resetKey, setResetKey] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState("");

  useEffect(() => {
    if (state && "success" in state) {
      setResetKey((k) => k + 1);
      setSelectedTeam("");
      onSuccess();
      router.refresh();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 items-start">
        <div className="space-y-1.5">
          <Label>Player name</Label>
          <PlayerAutocomplete
            onSelect={(player) => setSelectedTeam(player.team)}
            resetKey={resetKey}
          />
        </div>
        <div className="space-y-1.5" key={resetKey}>
          <Label>NBA team</Label>
          <SelectWithHidden
            name="nba_team"
            placeholder="Select team"
            externalValue={selectedTeam}
          />
        </div>
        <Button type="submit" disabled={isPending} className="whitespace-nowrap sm:col-span-2 xl:col-span-1">
          {isPending ? "Adding…" : "Add player"}
        </Button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-rose-400">{state.error}</p>
      )}
    </form>
  );
}

function RemoveButton({
  playerId,
  onSuccess,
}: {
  playerId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(removePlayer, null);

  useEffect(() => {
    if (state && "success" in state) {
      onSuccess();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction}>
      <input type="hidden" name="player_id" value={playerId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={isPending}
        aria-label="Remove player"
        className="text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}

interface Props {
  initialPlayers: RosterPlayer[];
}

export function RosterClient({ initialPlayers }: Props) {
  const router = useRouter();
  const [players, setPlayers] = useState<RosterPlayer[]>(initialPlayers);

  // Keep local state in sync when the server refreshes (via router.refresh())
  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers]);

  function handleRemove(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  const teamCount = new Set(players.map((p) => p.nba_team)).size;

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader title="My Roster" description="Track the NBA players on your fantasy team." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Players" value={players.length} hint="On your roster" />
        <StatTile label="NBA teams" value={teamCount} hint="Represented" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Add a player" className="self-start">
          <div className="p-4">
            <AddPlayerForm onSuccess={() => {}} />
          </div>
        </Panel>

        <Panel title={`Roster (${players.length})`}>
          {players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mb-1 font-medium">No players yet</p>
              <p className="text-sm text-muted-foreground">Add your first player using the form.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {players.map((player) => (
                <li key={player.id} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{player.player_name}</p>
                    <p className="text-xs text-muted-foreground">{player.nba_team}</p>
                  </div>
                  <RemoveButton playerId={player.id} onSuccess={() => handleRemove(player.id)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
