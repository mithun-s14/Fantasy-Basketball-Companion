import Link from "next/link";
import { ArrowRight, CalendarDays, Bot, Users, BarChart2, Lock } from "lucide-react";

interface Props {
  userEmail: string | null;
}

export function HomepageFeatureCards({ userEmail }: Props) {
  const locked = !userEmail;

  const tools = [
    { title: "Schedule Analyzer", body: "Game counts over any date range", href: "/analyzer", cta: "Open analyzer", Icon: CalendarDays, gated: false },
    { title: "AI Coach", body: "Trades, waivers and lineup calls", href: "/chat", cta: "Chat now", Icon: Bot, gated: false },
    {
      title: "My Roster",
      body: "Track your fantasy players",
      href: locked ? "/auth?next=/roster" : "/roster",
      cta: locked ? "Sign in to view roster" : "View roster",
      Icon: Users,
      gated: true,
    },
    {
      title: "Matchup Analysis",
      body: "Project 9 H2H categories",
      href: locked ? "/auth?next=/matchup" : "/matchup",
      cta: locked ? "Sign in to analyze matchup" : "Analyze matchup",
      Icon: BarChart2,
      gated: true,
    },
  ];

  return (
    <ul className="divide-y divide-border">
      {tools.map(({ title, body, href, cta, Icon, gated }) => (
        <li key={title}>
          <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{title}</h3>
                {gated && locked && (
                  <span className="flex items-center gap-1 rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" />
                    Sign in
                  </span>
                )}
              </div>
              <span className="block truncate text-xs text-muted-foreground">{body}</span>
            </div>
            <span className="hidden text-xs font-semibold text-primary xl:inline">{cta}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
