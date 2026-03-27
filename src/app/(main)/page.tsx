import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { HeroSection } from "@/components/HeroSection";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div>

      <HeroSection isLoggedIn={isLoggedIn} />

      {/* ── STATS BAR ── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-7">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 divide-x divide-gray-100">
            {[
              { value: "30", label: "NBA Teams Tracked" },
              { value: "2025–26", label: "Full Season Coverage" },
              { value: "Gemini", label: "AI-Powered Coach" },
              { value: "Free", label: "No subscription needed" },
            ].map((s) => (
              <div key={s.label} className="text-center px-4 first:pl-0 last:pr-0">
                <p className="text-[1.6rem] font-extrabold text-[#0C0C0C]">{s.value}</p>
                <p className="text-[13px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="bg-[#FAFAF8] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold text-[#111] mb-4"
              style={{ letterSpacing: "-0.03em" }}
            >
              Four tools. One edge.
            </h2>
            <p className="text-gray-500 text-[1.05rem] max-w-xl mx-auto">
              Built for serious fantasy managers who want an actual advantage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">

            {/* Schedule Analyzer */}
            <Link href="/analyzer" className="group bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-xl hover:shadow-black/[0.06] transition-all duration-300 overflow-hidden relative">
              <div className="absolute -top-14 -right-14 w-44 h-44 bg-orange-50 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="w-11 h-11 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                  <CalendarIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="text-[1.15rem] font-bold text-[#111] mb-2">Schedule Analyzer</h3>
                <p className="text-gray-500 text-[13.5px] leading-relaxed mb-5">
                  Pick any date range and see game counts for every NBA team. Spot streaming targets before your opponents do.
                </p>
                <div className="bg-[#FAFAF8] rounded-xl p-3 space-y-1.5 mb-5">
                  {[
                    { team: "GSW Warriors", g: 4, cls: "bg-green-100 text-green-700" },
                    { team: "PHX Suns",     g: 3, cls: "bg-yellow-100 text-yellow-700" },
                    { team: "NYK Knicks",   g: 1, cls: "bg-red-100 text-red-700" },
                  ].map((r) => (
                    <div key={r.team} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-700 font-medium">{r.team}</span>
                      <span className={`font-bold px-2 py-0.5 rounded-full ${r.cls}`}>{r.g}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold group-hover:gap-3 transition-all duration-200">
                  Open analyzer <ArrowIcon />
                </div>
              </div>
            </Link>

            {/* AI Coach */}
            <Link href="/chat" className="group bg-[#111] rounded-3xl p-8 hover:bg-[#161616] transition-all duration-300 overflow-hidden relative">
              <div className="absolute -top-14 -right-14 w-44 h-44 bg-[#F26419]/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                  <SparkleIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <h3 className="text-[1.15rem] font-bold text-white mb-2">AI Coach</h3>
                <p className="text-gray-400 text-[13.5px] leading-relaxed mb-5">
                  Ask anything about your lineup. Trade analysis, waiver targets, start/sit — powered by Gemini with your roster context baked in.
                </p>
                <div className="space-y-2 mb-5">
                  <div className="bg-white/[0.06] text-gray-300 text-[12px] px-3 py-2 rounded-xl rounded-tl-sm max-w-xs">
                    Pick up Sarr or Raynaud today?
                  </div>
                  <div className="bg-[#F26419] text-white text-[12px] px-3 py-2 rounded-xl rounded-tr-sm ml-auto max-w-xs">
                    Raynaud — Sacremento has 4 games this week vs Wizards&apos;s 2. Better upside.
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold group-hover:gap-3 transition-all duration-200">
                  Chat now <ArrowIcon />
                </div>
              </div>
            </Link>

            {/* Roster Management */}
            <Link href={isLoggedIn ? "/roster" : "/auth?next=/roster"} className="group bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-xl hover:shadow-black/[0.06] transition-all duration-300 overflow-hidden relative">
              <div className="absolute -top-14 -right-14 w-44 h-44 bg-orange-50 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="w-11 h-11 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                  <UsersIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[1.15rem] font-bold text-[#111]">Roster Management</h3>
                  {!isLoggedIn && <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Sign in</span>}
                </div>
                <p className="text-gray-500 text-[13.5px] leading-relaxed mb-5">
                  Track your fantasy roster with real player data. The AI uses your roster to personalise every recommendation it gives you.
                </p>
                <div className="space-y-1.5 mb-5">
                  {[
                    { name: "LeBron James", team: "LAL", pts: "27.4", up: true },
                    { name: "Nikola Jokic",  team: "DEN", pts: "26.1", up: false },
                    { name: "Jayson Tatum",  team: "BOS", pts: "28.7", up: true },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center justify-between text-[12px] bg-[#FAFAF8] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-gray-200 rounded-full" />
                        <span className="font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-400">{p.team}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold group-hover:gap-3 transition-all duration-200">
                  {isLoggedIn ? "Manage roster" : "Sign in to track roster"} <ArrowIcon />
                </div>
              </div>
            </Link>

            {/* Matchup Analysis */}
            <Link href={isLoggedIn ? "/matchup" : "/auth?next=/matchup"} className="group bg-white rounded-3xl p-8 border border-gray-100 hover:shadow-xl hover:shadow-black/[0.06] transition-all duration-300 overflow-hidden relative">
              <div className="absolute -top-14 -right-14 w-44 h-44 bg-orange-50 rounded-full blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="w-11 h-11 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                  <BarChartIcon className="w-5 h-5 text-[#F26419]" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[1.15rem] font-bold text-[#111]">Matchup Analysis</h3>
                  {!isLoggedIn && <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Sign in</span>}
                </div>
                <p className="text-gray-500 text-[13.5px] leading-relaxed mb-5">
                  Head-to-head category breakdown vs your opponent this week. See where you&apos;re projected to win and where you need to make moves.
                </p>
                <div className="space-y-2 mb-5">
                  {[
                    { cat: "PTS", win: true,  w: "68%" },
                    { cat: "REB", win: false, w: "40%" },
                    { cat: "AST", win: true,  w: "72%" },
                    { cat: "3PM", win: true,  w: "60%" },
                  ].map((c) => (
                    <div key={c.cat} className="flex items-center gap-2.5 text-[11px]">
                      <span className="text-gray-500 font-semibold w-7">{c.cat}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${c.win ? "bg-green-400" : "bg-red-300"}`}
                          style={{ width: c.w }}
                        />
                      </div>
                      <span className={`font-bold ${c.win ? "text-green-600" : "text-red-400"}`}>{c.win ? "W" : "L"}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[#F26419] text-[13px] font-semibold group-hover:gap-3 transition-all duration-200">
                  {isLoggedIn ? "Analyze matchup" : "Sign in to analyze"} <ArrowIcon />
                </div>
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              className="text-[clamp(2rem,4vw,3.2rem)] font-extrabold text-[#111] mb-4"
              style={{ letterSpacing: "-0.03em" }}
            >
              Up and running in minutes.
            </h2>
            <p className="text-gray-500 text-[1.05rem]">No complex setup. No spreadsheets. Just better decisions.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-gray-100" />
            {[
              {
                n: "01", title: "Create a free account",
                desc: "Sign up in seconds with your email. No credit card, no subscription.",
                icon: <UserIcon className="w-5 h-5 text-[#F26419]" />,
              },
              {
                n: "02", title: "Add your roster",
                desc: "Search NBA players and build your fantasy roster. The AI reads it for context.",
                icon: <PlusIcon className="w-5 h-5 text-[#F26419]" />,
              },
              {
                n: "03", title: "Get AI-powered insights",
                desc: "Chat with your coach, analyze schedules, dominate your matchup.",
                icon: <SparkleIcon className="w-5 h-5 text-[#F26419]" />,
              },
            ].map((s) => (
              <div key={s.n} className="relative text-center">
                <div className="relative inline-flex w-16 h-16 bg-orange-50 rounded-2xl items-center justify-center mb-5 ring-4 ring-white">
                  {s.icon}
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#F26419] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {parseInt(s.n)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#111] mb-2">{s.title}</h3>
                <p className="text-gray-500 text-[13.5px] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCHEDULE ANALYZER DEEP DIVE ── */}
      <section className="bg-[#FAFAF8] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <div>
              <div className="inline-flex items-center gap-2 bg-orange-100 rounded-full px-3 py-1 mb-6">
                <span className="text-[11px] font-bold text-[#F26419] uppercase tracking-widest">Feature Spotlight</span>
              </div>
              <h2
                className="text-[clamp(2rem,4vw,3rem)] font-extrabold text-[#111] mb-5"
                style={{ letterSpacing: "-0.03em" }}
              >
                Know exactly<br />who to stream.
              </h2>
              <p className="text-gray-500 text-[1.05rem] leading-relaxed mb-7">
                The Schedule Analyzer shows game counts per team for any date range. Pick a week, spot teams with 4–5 games, and find the streamers nobody else noticed.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Color-coded badges — green (4+ games), yellow (2–3), red (1)",
                  "Filter by specific teams to focus on your roster",
                  "Plan waiver pickups days in advance",
                  "Covers the full 2025–26 NBA regular season",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[13.5px] text-gray-600">
                    <CheckIcon className="w-4 h-4 text-[#F26419] mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/analyzer"
                className="inline-flex items-center gap-2 bg-[#F26419] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#d95a17] transition-colors duration-200"
              >
                Try it now — it&apos;s free <ArrowIcon />
              </Link>
            </div>

            {/* Table mockup */}
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-lg">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">Week of Mar 10 – Mar 16</p>
                  <p className="text-[11px] text-gray-400">30 teams · 2025–26 Season</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">4+ Start</span>
                  <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">2–3 OK</span>
                  <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">1 Sit</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { rank: 1, team: "Boston Celtics",       abbr: "BOS", g: 5, cls: "bg-green-100 text-green-700" },
                  { rank: 2, team: "Golden State Warriors", abbr: "GSW", g: 4, cls: "bg-green-100 text-green-700" },
                  { rank: 3, team: "LA Lakers",             abbr: "LAL", g: 4, cls: "bg-green-100 text-green-700" },
                  { rank: 4, team: "Milwaukee Bucks",       abbr: "MIL", g: 4, cls: "bg-green-100 text-green-700" },
                  { rank: 5, team: "Denver Nuggets",        abbr: "DEN", g: 3, cls: "bg-yellow-100 text-yellow-700" },
                  { rank: 6, team: "Miami Heat",            abbr: "MIA", g: 3, cls: "bg-yellow-100 text-yellow-700" },
                  { rank: 7, team: "Phoenix Suns",          abbr: "PHX", g: 2, cls: "bg-yellow-100 text-yellow-700" },
                  { rank: 8, team: "Chicago Bulls",         abbr: "CHI", g: 1, cls: "bg-red-100 text-red-700" },
                ].map((row) => (
                  <div key={row.team} className="flex items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span className="w-6 text-[11px] text-gray-300 font-semibold">{row.rank}</span>
                    <div className="flex-1">
                      <span className="text-[13px] font-medium text-gray-800">{row.team}</span>
                      <span className="ml-2 text-[11px] text-gray-400">{row.abbr}</span>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${row.cls}`}>{row.g} games</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── AI COACH DEEP DIVE ── */}
      <section className="bg-[#0C0C0C] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Chat mockup */}
            <div className="bg-[#161616] border border-white/[0.08] rounded-3xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center gap-3">
                <div className="w-8 h-8 bg-[#F26419] rounded-full flex items-center justify-center shrink-0">
                  <SparkleIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">AI Coach</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[11px] text-gray-500">Powered by Gemini</span>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex justify-end">
                  <div className="bg-white/[0.08] text-gray-200 text-[12.5px] px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[260px]">
                    Who should I start at center — Embiid or Bam?
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="w-7 h-7 bg-[#F26419] rounded-full flex items-center justify-center shrink-0 mt-1">
                    <SparkleIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-[#1E1E1E] text-gray-200 text-[12.5px] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[300px] leading-relaxed">
                    Start <span className="text-[#F26419] font-semibold">Embiid tonight</span> — great matchup vs OKC, averaging 32/11 at home. But the <span className="text-white font-medium">Sixers have just 1 game this week</span> vs Miami&apos;s 3. Consider grabbing a streamer for the rest.
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="bg-white/[0.08] text-gray-200 text-[12.5px] px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[220px]">
                    Give me 3 waiver targets this week
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="w-7 h-7 bg-[#F26419] rounded-full flex items-center justify-center shrink-0 mt-1">
                    <SparkleIcon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-[#1E1E1E] text-gray-200 text-[12.5px] px-4 py-3 rounded-2xl rounded-tl-sm max-w-[300px] leading-relaxed">
                    Top streamers this week:<br />
                    <span className="text-[#F26419] font-semibold">1. Dario Saric</span> (GSW) — 4 games, starting C<br />
                    <span className="text-[#F26419] font-semibold">2. Aaron Gordon</span> (DEN) — 3 games, pts/reb<br />
                    <span className="text-[#F26419] font-semibold">3. Keyonte George</span> (UTA) — 4 games, hot 🔥
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-white/[0.08]">
                <div className="flex items-center gap-3 bg-white/[0.04] rounded-xl px-4 py-2.5">
                  <span className="text-[13px] text-gray-600 flex-1">Ask anything about your lineup...</span>
                  <div className="w-7 h-7 bg-[#F26419] rounded-lg flex items-center justify-center">
                    <ArrowIcon className="text-white" />
                  </div>
                </div>
              </div>
            </div>

            {/* Text */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/[0.08] rounded-full px-3 py-1 mb-6">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">AI Coach</span>
              </div>
              <h2
                className="text-[clamp(2rem,4vw,3rem)] font-extrabold text-white mb-5"
                style={{ letterSpacing: "-0.03em" }}
              >
                Your personal<br />fantasy analyst.
              </h2>
              <p className="text-gray-400 text-[1.05rem] leading-relaxed mb-7">
                Ask anything. Get instant, personalised advice based on your actual roster and the live NBA schedule.
              </p>
              <ul className="space-y-4 mb-8">
                {[
                  { title: "Start/sit decisions", desc: "Matchup-aware advice for tonight's games" },
                  { title: "Waiver wire targets", desc: "AI surfaces streamers based on schedule data" },
                  { title: "Trade analysis",      desc: "Understand if a trade improves your category balance" },
                  { title: "Roster context",      desc: "Sign in so the AI knows your exact team" },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <div className="w-5 h-5 bg-[#F26419]/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <CheckIcon className="w-3 h-3 text-[#F26419]" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-[13.5px]">{item.title}</p>
                      <p className="text-gray-500 text-[13px]">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 bg-[#F26419] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#d95a17] transition-colors duration-200"
              >
                Chat with AI Coach <ArrowIcon />
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24" style={{ backgroundColor: "#F26419" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2
            className="text-[clamp(2.4rem,5vw,3.8rem)] font-extrabold text-white mb-5"
            style={{ letterSpacing: "-0.035em" }}
          >
            Ready to dominate<br />your league?
          </h2>
          <p className="text-white/75 text-[1.1rem] mb-10">
            Free to use. No subscription. Just better fantasy basketball.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/analyzer" : "/auth"}
              className="inline-flex items-center gap-2 bg-white text-[#F26419] px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-orange-50 transition-colors duration-200"
            >
              {isLoggedIn ? "Open Schedule Analyzer" : "Get Started — It's Free"}
              <ArrowIcon />
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/25 px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors duration-200"
            >
              Try AI Coach
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0C0C0C] py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#F26419] rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-[13px]">Fantasy Basketball Companion</p>
              <p className="text-gray-600 text-[11px]">© 2025 · Built by Mithun Sivapathasundram</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/analyzer" className="text-gray-500 hover:text-white text-[13px] transition-colors">Schedule Analyzer</Link>
            <Link href="/chat"     className="text-gray-500 hover:text-white text-[13px] transition-colors">AI Coach</Link>
            <Link href="/auth"     className="text-gray-500 hover:text-white text-[13px] transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

/* ── Tiny inline icons ── */
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
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
function UserIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}
function PlusIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}
