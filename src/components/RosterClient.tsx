"use client";

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Users, Trash2 } from "lucide-react";
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
import { AuthButton } from "@/components/AuthButton";
import { addPlayer, removePlayer } from "@/app/roster/actions";
import { NBA_TEAMS } from "@/lib/constants";
import type { RosterPlayer } from "@/lib/types";

// Syncs a shadcn Select's value into a hidden input inside the form boundary.
// Radix UI portals the dropdown outside the form, so native FormData misses it.
function SelectWithHidden({
  name,
  placeholder,
}: {
  name: string;
  placeholder: string;
}) {
  const [value, setValue] = useState("");

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

function AddPlayerForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(addPlayer, null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (state && "success" in state) {
      setResetKey((k) => k + 1);
      onSuccess();
      router.refresh();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="player-name">Player name</Label>
          <Input
            id="player-name"
            name="player_name"
            placeholder="e.g. LeBron James"
            required
          />
        </div>
        <div className="space-y-1.5" key={resetKey}>
          <Label>NBA team</Label>
          <SelectWithHidden name="nba_team" placeholder="Select team" />
        </div>
        <Button type="submit" disabled={isPending} className="whitespace-nowrap">
          {isPending ? "Adding…" : "Add player"}
        </Button>
      </div>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
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
        className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}

interface Props {
  initialPlayers: RosterPlayer[];
  userEmail: string;
}

export function RosterClient({ initialPlayers, userEmail }: Props) {
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

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-black/6 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-gray-900 tracking-tight">
              Fantasy Basketball Companion
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/analyzer"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
            >
              Schedule
            </Link>
            <Link
              href="/chat"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
            >
              AI Coach
            </Link>
            <AuthButton userEmail={userEmail} />
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
            My Roster
          </h1>
          <p className="text-gray-500">
            Track the NBA players on your fantasy team.
          </p>
        </div>

        {/* Add player form */}
        <div className="bg-gray-50 rounded-3xl p-8 mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Add a player
          </h2>
          <AddPlayerForm onSuccess={() => {}} />
        </div>

        {/* Player list */}
        {players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-gray-400" />
            </div>
            <p className="font-medium text-gray-900 mb-1">No players yet</p>
            <p className="text-sm text-gray-500">
              Add your first player using the form above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {player.player_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{player.nba_team}</p>
                </div>
                <RemoveButton
                  playerId={player.id}
                  onSuccess={() => handleRemove(player.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
