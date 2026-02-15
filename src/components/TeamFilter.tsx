"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NBA_TEAMS } from "@/lib/constants";
import { ChevronDown } from "lucide-react";

interface TeamFilterProps {
  selectedTeams: Set<string>;
  onSelectedTeamsChange: (teams: Set<string>) => void;
}

export function TeamFilter({ selectedTeams, onSelectedTeamsChange }: TeamFilterProps) {
  const [open, setOpen] = useState(false);

  const allSelected = selectedTeams.size === NBA_TEAMS.length;

  const handleAllToggle = () => {
    if (allSelected) {
      onSelectedTeamsChange(new Set());
    } else {
      onSelectedTeamsChange(new Set(NBA_TEAMS));
    }
  };

  const handleTeamToggle = (team: string) => {
    const next = new Set(selectedTeams);
    if (next.has(team)) {
      next.delete(team);
    } else {
      next.add(team);
    }
    onSelectedTeamsChange(next);
  };

  const label = allSelected
    ? `All Teams (${NBA_TEAMS.length})`
    : `${selectedTeams.size} of ${NBA_TEAMS.length} teams`;

  return (
    <div className="flex flex-col gap-2 w-full sm:w-auto">
      <label className="text-sm font-medium">Filter Teams</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full sm:w-60 justify-between text-left"
          >
            <span>{label}</span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0" align="start">
          <div className="p-3 border-b">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleAllToggle}
              />
              <span className="text-sm font-medium">All Teams</span>
            </label>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="p-3 space-y-2">
              {NBA_TEAMS.map((team) => (
                <label key={team} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedTeams.has(team)}
                    onCheckedChange={() => handleTeamToggle(team)}
                  />
                  <span className="text-sm">{team}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
