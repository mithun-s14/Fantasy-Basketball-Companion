import Link from "next/link";
import { ArrowRight, CalendarDays, Bot, Users, BarChart2, Lock } from "lucide-react";

interface Props {
  userEmail: string | null;
}

export function HomepageFeatureCards({ userEmail }: Props) {
  const locked = !userEmail;

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {/* Schedule Analyzer */}
      <Link
        href="/analyzer"
        className="group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <CalendarDays className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            Schedule Analyzer
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Pick any date range and instantly see how many games each NBA team plays.
            Identify streaming targets and plan your lineup moves with precision.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            Open analyzer <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* AI Coach */}
      <Link
        href="/chat"
        className="group relative bg-gray-900 rounded-3xl p-9 hover:bg-[#111] transition-colors duration-200 overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-7">
            <Bot className="w-6 h-6 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-3">
            AI Coach
          </h2>
          <p className="text-gray-400 leading-relaxed mb-8 text-[15px]">
            Ask anything about your fantasy team. Get trade advice, waiver wire
            recommendations, and strategic insights powered by a large language model.
          </p>
          <div className="flex items-center gap-1.5 text-orange-400 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            Chat now <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* My Roster */}
      <Link
        href={locked ? "/auth?next=/roster" : "/roster"}
        className={`group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden${locked ? " opacity-75" : ""}`}
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        {locked && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
            <Lock className="w-3 h-3" />
            Sign in
          </div>
        )}
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            My Roster
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Track the NBA players on your fantasy team. Add and remove players
            as the season evolves.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            {locked ? "Sign in to view roster" : "View roster"} <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* Matchup Analysis */}
      <Link
        href={locked ? "/auth?next=/matchup" : "/matchup"}
        className={`group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden${locked ? " opacity-75" : ""}`}
      >
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
        {locked && (
          <div className="absolute top-4 right-4 flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
            <Lock className="w-3 h-3" />
            Sign in
          </div>
        )}
        <div className="relative">
          <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-7">
            <BarChart2 className="w-6 h-6 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
            Matchup Analysis
          </h2>
          <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
            Compare your roster against your opponent&apos;s. See projected stat
            category winners and identify where you need to stream or sit players.
          </p>
          <div className="flex items-center gap-1.5 text-orange-600 font-semibold text-sm group-hover:gap-2.5 transition-all duration-150">
            {locked ? "Sign in to analyze matchup" : "Analyze matchup"} <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </div>
  );
}
