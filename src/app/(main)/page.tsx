import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { NBA_TEAMS } from "@/lib/constants";

/* ── helpers ── */

function getWeekRange(): { start: string; end: string; label: string } {
  const today = new Date();
  const day = today.getDay(); // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const iso = (d: Date) => d.toISOString().split("T")[0];
  const label = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return { start: iso(mon), end: iso(sun), label: `${label(mon)} – ${label(sun)}` };
}

async function fetchWeeklyLeaders(start: string, end: string) {
  try {
    const supabase = createServerSupabaseClient();
    const [{ data: home }, { data: away }] = await Promise.all([
      supabase.from("games").select("home_team").gte("game_date", start).lte("game_date", end),
      supabase.from("games").select("away_team").gte("game_date", start).lte("game_date", end),
    ]);

    const counts: Record<string, number> = {};
    NBA_TEAMS.forEach((t) => (counts[t] = 0));
    const valid = new Set(NBA_TEAMS);
    for (const r of home ?? []) if (valid.has(r.home_team)) counts[r.home_team]++;
    for (const r of away ?? []) if (valid.has(r.away_team)) counts[r.away_team]++;

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([team, games], i) => ({ rank: i + 1, team, games }));
  } catch {
    return [];
  }
}

function badgeCls(g: number) {
  if (g >= 4) return "bg-green-100 text-green-700";
  if (g >= 2) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

/* ── page ── */

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const week = getWeekRange();
  const leaders = await fetchWeeklyLeaders(week.start, week.end);

  let rosterCount = 0;
  if (user) {
    const { count } = await supabase
      .from("roster_players")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    rosterCount = count ?? 0;
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const firstName = user?.email?.split("@")[0] ?? null;

  return (
    <div className="min-h-screen bg-[#F7F7F5]">

      {/* ── Header banner ── */}
      <div className="bg-[#0C0C0C] border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-[#F26419] text-xs font-bold uppercase tracking-widest mb-1">
              {today}
            </p>
            <h1
              className="text-white text-[clamp(1.6rem,3vw,2.4rem)] font-extrabold leading-tight"
              style={{ letterSpacing: "-0.03em" }}
            >
              {user
                ? `Welcome back${firstName ? `, ${firstName}` : ""}.`
                : "Your fantasy command centre."}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {user
                ? "Here's what's happening this week."
                : "Sign in to unlock your full roster and matchup tools."}
            </p>
          </div>

          {!user && (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-[#F26419] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#d95a17] transition-colors shrink-0"
            >
              Sign in free <ArrowIcon />
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* ── Stat chips (logged-in only) ── */}
        {user && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Players on Roster", value: rosterCount.toString(), href: "/roster", accent: true },
              { label: "Teams Tracked", value: "30", href: "/analyzer", accent: false },
              { label: "Season", value: "2025–26", href: "/analyzer", accent: false },
              { label: "AI Coach", value: "Active", href: "/chat", accent: false },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={`rounded-2xl p-5 hover:scale-[1.02] transition-transform duration-200 cursor-pointer ${
                  s.accent
                    ? "bg-[#F26419] text-white"
                    : "bg-white border border-gray-100 text-[#111]"
                }`}
              >
                <p
                  className={`text-[2rem] font-extrabold leading-none mb-1 ${
                    s.accent ? "text-white" : "text-[#111]"
                  }`}
                >
                  {s.value}
                </p>
                <p
                  className={`text-xs font-medium ${
                    s.accent ? "text-white/70" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* ── Main grid ── */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">

          {/* Left: Tool cards */}
          <div className="space-y-4">
            <h2 className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Tools</h2>

            <div className="grid sm:grid-cols-2 gap-4">

              {/* Schedule Analyzer */}
              <Link
                href="/analyzer"
                className="group bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:shadow-black/[0.06] transition-all duration-200 flex flex-col"
              >
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
                  <CalendarIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="font-bold text-[#111] mb-1.5">Schedule Analyzer</h3>
                <p className="text-gray-400 text-[13px] leading-relaxed flex-1">
                  Game counts for every team across any date range. Spot streamers before anyone else.
                </p>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold mt-4 group-hover:gap-2.5 transition-all">
                  Open <ArrowIcon />
                </div>
              </Link>

              {/* AI Coach */}
              <Link
                href="/chat"
                className="group bg-[#111] rounded-2xl p-6 hover:bg-[#161616] transition-all duration-200 flex flex-col"
              >
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4">
                  <SparkleIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="font-bold text-white mb-1.5">AI Coach</h3>
                <p className="text-gray-400 text-[13px] leading-relaxed flex-1">
                  Start/sit decisions, waiver targets, trade analysis — powered by Gemini with your roster context.
                </p>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold mt-4 group-hover:gap-2.5 transition-all">
                  Chat now <ArrowIcon />
                </div>
              </Link>

              {/* Roster */}
              <Link
                href={user ? "/roster" : "/auth?next=/roster"}
                className="group bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:shadow-black/[0.06] transition-all duration-200 flex flex-col relative overflow-hidden"
              >
                {!user && (
                  <span className="absolute top-3 right-3 text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <LockIcon className="w-2.5 h-2.5" /> Sign in
                  </span>
                )}
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
                  <UsersIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="font-bold text-[#111] mb-1.5">My Roster</h3>
                <p className="text-gray-400 text-[13px] leading-relaxed flex-1">
                  {user && rosterCount > 0
                    ? `${rosterCount} player${rosterCount !== 1 ? "s" : ""} tracked. Manage your squad and keep the AI in context.`
                    : "Add your NBA players so the AI Coach can give you personalised advice."}
                </p>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold mt-4 group-hover:gap-2.5 transition-all">
                  {user ? "Manage roster" : "Sign in to track"} <ArrowIcon />
                </div>
              </Link>

              {/* Matchup */}
              <Link
                href={user ? "/matchup" : "/auth?next=/matchup"}
                className="group bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:shadow-black/[0.06] transition-all duration-200 flex flex-col relative overflow-hidden"
              >
                {!user && (
                  <span className="absolute top-3 right-3 text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <LockIcon className="w-2.5 h-2.5" /> Sign in
                  </span>
                )}
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
                  <BarChartIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="font-bold text-[#111] mb-1.5">Matchup Analysis</h3>
                <p className="text-gray-400 text-[13px] leading-relaxed flex-1">
                  Head-to-head category projections against your opponent. See where to stream, sit, or trade.
                </p>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold mt-4 group-hover:gap-2.5 transition-all">
                  {user ? "Analyze matchup" : "Sign in to analyze"} <ArrowIcon />
                </div>
              </Link>

            </div>
          </div>

          {/* Right: This week's game leaders */}
          <div className="space-y-4">
            <h2 className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">
              This Week&apos;s Schedule
            </h2>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#111]">{week.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Game count — top 8 teams</p>
                </div>
                <Link
                  href="/analyzer"
                  className="text-[12px] text-[#F26419] font-semibold hover:underline"
                >
                  Full view →
                </Link>
              </div>

              {/* Legend */}
              <div className="flex gap-2 px-5 py-2.5 bg-gray-50/60 border-b border-gray-50">
                {[
                  { cls: "bg-green-100 text-green-700", label: "4+ Start" },
                  { cls: "bg-yellow-100 text-yellow-700", label: "2–3 OK" },
                  { cls: "bg-red-100 text-red-700", label: "1 Sit" },
                ].map((b) => (
                  <span
                    key={b.label}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.cls}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {leaders.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-[13px]">
                  No games scheduled this week.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {leaders.map((row) => (
                    <div
                      key={row.team}
                      className="flex items-center px-5 py-3 hover:bg-gray-50/60 transition-colors"
                    >
                      <span className="w-6 text-[11px] text-gray-300 font-semibold shrink-0">
                        {row.rank}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-gray-800 truncate">
                        {row.team}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${badgeCls(row.games)}`}
                      >
                        {row.games}G
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-5 py-3 border-t border-gray-50">
                <Link
                  href="/analyzer"
                  className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400 hover:text-[#F26419] transition-colors font-medium"
                >
                  See all 30 teams <ArrowIcon className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Quick tip card */}
            {!user && (
              <div className="bg-[#F26419]/8 border border-[#F26419]/20 rounded-2xl p-5">
                <p className="text-[13px] font-semibold text-[#F26419] mb-1">Unlock more</p>
                <p className="text-[12.5px] text-gray-500 leading-relaxed mb-3">
                  Sign in to track your roster, run matchup analysis, and get AI advice tailored to your actual team.
                </p>
                <Link
                  href="/auth"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#F26419] hover:underline"
                >
                  Create free account <ArrowIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {user && rosterCount === 0 && (
              <div className="bg-[#F26419]/8 border border-[#F26419]/20 rounded-2xl p-5">
                <p className="text-[13px] font-semibold text-[#F26419] mb-1">Add your roster</p>
                <p className="text-[12.5px] text-gray-500 leading-relaxed mb-3">
                  The AI Coach gives much better advice when it knows your actual players. Takes 30 seconds.
                </p>
                <Link
                  href="/roster"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#F26419] hover:underline"
                >
                  Build your roster <ArrowIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Inline icons ── */

function ArrowIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}
function SparkleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  );
}
function CalendarIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}
function UsersIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}
function BarChartIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}
function LockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
