import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, Bot, Users } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { AuthButton } from "@/components/AuthButton";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-black/6 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-gray-900 tracking-tight">Fantasy Basketball Companion</span>
          </div>
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
            {userEmail && (
              <Link
                href="/roster"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
              >
                Roster
              </Link>
            )}
            <AuthButton userEmail={userEmail} />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50/70 via-white to-white pointer-events-none" />
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-orange-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-24 text-center">
          {/* Season badge */}
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-4 py-1.5 mb-10">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-sm text-orange-700 font-medium">2025–26 NBA Season</span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold text-gray-900 tracking-tight leading-[1.05] mb-6">
            Win your NBA<br />fantasy league.
          </h1>

          <p className="text-xl text-gray-500 max-w-xl mx-auto mb-12 leading-relaxed">
            Analyze NBA schedules to find streaming opportunities, read up on injury reports, then get personalized advice from an AI coach.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/analyzer"
              className="group inline-flex items-center gap-2 bg-gray-900 text-white px-7 py-3.5 rounded-2xl font-semibold text-sm hover:bg-gray-800 transition-colors duration-150"
            >
              Open Schedule Analyzer
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" />
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 bg-white text-gray-900 border border-gray-200 px-7 py-3.5 rounded-2xl font-semibold text-sm hover:bg-gray-50 transition-colors duration-150"
            >
              Chat with AI Coach
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className={`grid gap-5 ${userEmail ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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

          {/* Roster — only shown when logged in */}
          {userEmail && (
            <Link
              href="/roster"
              className="group relative bg-gray-50 rounded-3xl p-9 hover:bg-gray-100/80 transition-colors duration-200 overflow-hidden"
            >
              <div className="absolute -top-12 -right-12 w-56 h-56 bg-orange-100/60 rounded-full blur-3xl pointer-events-none" />
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
                  View roster <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
