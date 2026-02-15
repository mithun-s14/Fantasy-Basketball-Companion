import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { NBA_TEAMS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "Both 'start' and 'end' query parameters are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start) || !dateRegex.test(end)) {
    return NextResponse.json(
      { error: "Dates must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  if (start > end) {
    return NextResponse.json(
      { error: "Start date must be before or equal to end date" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data: homeGames, error: homeError } = await supabase
      .from("games")
      .select("home_team")
      .gte("game_date", start)
      .lte("game_date", end);

    if (homeError) throw homeError;

    const { data: awayGames, error: awayError } = await supabase
      .from("games")
      .select("away_team")
      .gte("game_date", start)
      .lte("game_date", end);

    if (awayError) throw awayError;

    // Initialize all teams to 0
    const gameCounts: Record<string, number> = {};
    NBA_TEAMS.forEach((team) => {
      gameCounts[team] = 0;
    });

    for (const row of homeGames) {
      gameCounts[row.home_team] = (gameCounts[row.home_team] || 0) + 1;
    }
    for (const row of awayGames) {
      gameCounts[row.away_team] = (gameCounts[row.away_team] || 0) + 1;
    }

    const totalGames = homeGames.length;

    return NextResponse.json({
      gameCounts,
      totalGames,
      dateRange: { start, end },
    });
  } catch (err) {
    console.error("Failed to fetch game counts:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
