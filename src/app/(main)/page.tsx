import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { HomepageFeatureCards } from "@/components/HomepageFeatureCards";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  return (
    <div className="min-h-screen bg-white">
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
            Analyze NBA schedules to find streaming opportunities, get personalized advice from an AI coach powered by Gemini, and sign in to get matchup analysis.
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
        <HomepageFeatureCards userEmail={userEmail} />
      </section>
    </div>
  );
}
