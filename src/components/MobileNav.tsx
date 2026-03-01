"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

interface MobileNavProps {
  userEmail: string | null;
}

export function MobileNav({ userEmail }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-gray-600 hover:text-gray-900"
        aria-label="Toggle menu"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-black/8 rounded-lg shadow-lg py-2 flex flex-col">
          <Link
            href="/analyzer"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
            onClick={() => setOpen(false)}
          >
            Schedule Analyzer
          </Link>
          <Link
            href="/chat"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
            onClick={() => setOpen(false)}
          >
            AI Coach
          </Link>
          {userEmail && (
            <Link
              href="/roster"
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors font-medium"
              onClick={() => setOpen(false)}
            >
              Roster
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
