import { NextRequest, NextResponse } from "next/server";
import { getActivePlayers, searchPlayers } from "@/lib/nba-players";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  if (search.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const players = await getActivePlayers();
    return NextResponse.json(searchPlayers(players, search));
  } catch (err) {
    console.error("Failed to fetch NBA players:", err);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}
