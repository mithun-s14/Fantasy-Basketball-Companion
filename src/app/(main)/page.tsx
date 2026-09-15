import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { NBA_TEAMS } from "@/lib/constants";
import { gameTierClass } from "@/lib/utils";
import { HomepageFeatureCards } from "@/components/HomepageFeatureCards";
import { PageHeader, Panel, StatTile } from "@/components/PageHeader";

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

async function fetchWeeklyCounts(start: string, end: string) {
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
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([team, games], i) => ({ rank: i + 1, team, games }));
  } catch {
    return [];
  }
}

/* ── page ── */

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const week = getWeekRange();
  const teams = await fetchWeeklyCounts(week.start, week.end);

  let rosterCount: number | null = null;
  if (user) {
    const { count } = await supabase
      .from("roster_players")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    rosterCount = count ?? 0;
  }

  const firstName = user?.email?.split("@")[0] ?? null;
  const leagueGames = teams.reduce((sum, t) => sum + t.games, 0) / 2;
  const top = teams[0];
  const maxGames = Math.max(1, top?.games ?? 0);
  const hasGames = leagueGames > 0;
  const fourPlus = teams.filter((t) => t.games >= 4).length;
  const fewest = [...teams].reverse().slice(0, 5);

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={user ? `Welcome back${firstName ? `, ${firstName}` : ""}` : "Overview"}
        description={`Week of ${week.label}`}
        actions={
          !user && (
            <Link
              href="/auth?tab=signup"
              className="inline-flex items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Create free account <ArrowIcon />
            </Link>
          )
        }
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="League games" value={leagueGames} hint="Scheduled this week" />
        <StatTile label="Most games" value={top?.games ?? 0} hint={hasGames ? top.team : "—"} />
        <StatTile label="Teams with 4+" value={fourPlus} hint="Best streaming pool" />
        <StatTile
          label="Players on roster"
          value={rosterCount ?? "—"}
          hint={user ? (rosterCount ? "Tracked on My Roster" : "Add players to get started") : "Sign in to track"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ── Games per team (single series, one hue, ranked) ── */}
        <Panel
          title="Games per team this week"
          action={
            <Link href="/analyzer" className="text-xs font-semibold text-primary hover:underline">
              Open analyzer →
            </Link>
          }
        >
          {!hasGames ? (
            <div className="flex flex-1 items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground">
              No games scheduled this week. Check back once the season tips off.
            </div>
          ) : (
            <ol className="grid gap-x-8 p-4 sm:grid-cols-2 sm:grid-flow-col sm:grid-rows-[repeat(15,auto)]">
              {teams.map((t, i) => (
                <li key={t.team} title={`${t.team}: ${t.games} games`} className="grid grid-cols-[1.5rem_minmax(0,9rem)_1fr_1.5rem] items-center gap-2 rounded py-1 text-xs hover:bg-accent/50">
                  <span className="text-right tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{t.team}</span>
                  <span className="h-2.5">
                    <span className="block h-full rounded-r-[4px] bg-primary" style={{ width: `${(t.games / maxGames) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{t.games}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Streaming targets">
            <TeamList rows={hasGames ? teams.slice(0, 5) : []} />
          </Panel>
          <Panel title="Fewest games · consider sitting">
            <TeamList rows={hasGames ? fewest : []} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Tools">
          <HomepageFeatureCards userEmail={user?.email ?? null} />
        </Panel>
        <Panel title={user && rosterCount === 0 ? "Next step" : "Tip"}>
          <div className="space-y-2 p-4 text-sm">
            {user && rosterCount === 0 ? (
              <>
                <p className="text-muted-foreground">The AI Coach gives much better advice when it knows your players.</p>
                <Link href="/roster" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                  Build your roster <ArrowIcon className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">
                Teams with <span className="font-semibold text-emerald-300">4+ games</span> in a week are the best waiver pickups.
                Pair them with the Matchup Analysis to see which categories they swing.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TeamList({ rows }: { rows: { team: string; games: number }[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-xs text-muted-foreground">No games this week.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.team} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="truncate">{r.team}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${gameTierClass(r.games)}`}>
            {r.games} {r.games === 1 ? "game" : "games"}
          </span>
        </li>
      ))}
    </ul>
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
