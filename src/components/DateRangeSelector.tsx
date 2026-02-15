"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

interface DateRangeSelectorProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

export function DateRangeSelector({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeSelectorProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="flex flex-col gap-2 w-full sm:w-auto">
        <label className="text-sm font-medium">Start Date</label>
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-60 justify-start text-left"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => {
                onStartDateChange(date);
                setStartOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-2 w-full sm:w-auto">
        <label className="text-sm font-medium">End Date</label>
        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-60 justify-start text-left"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(date) => {
                onEndDateChange(date);
                setEndOpen(false);
              }}
              disabled={(date) =>
                startDate ? date < startDate : false
              }
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
