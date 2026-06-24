import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  let messages: Message[];
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages", { status: 400 });
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Resolve roster context here — web owns auth, ai-service does not
  let rosterContext = "";
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: roster } = await supabase
        .from("roster_players")
        .select("player_name, nba_team")
        .eq("user_id", user.id);

      if (roster && roster.length > 0) {
        const playerList = roster
          .map((p) => `${p.player_name} (${p.nba_team})`)
          .join(", ");
        rosterContext = `The user's current fantasy roster: ${playerList}. Reference these players when giving personalized advice.`;
      }
    }
  } catch {
    // Auth unavailable — continue without roster context
  }

  // Forward to ai-service, passing the original client IP for rate limiting
  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:3001";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  let aiResponse: Response;
  try {
    aiResponse = await fetch(`${aiServiceUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify({ messages, rosterContext }),
    });
  } catch {
    return new Response("AI service unreachable", { status: 503 });
  }

  // Pipe the streaming response straight through — no buffering
  return new Response(aiResponse.body, {
    status: aiResponse.status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      ...(aiResponse.headers.get("Retry-After")
        ? { "Retry-After": aiResponse.headers.get("Retry-After")! }
        : {}),
    },
  });
}
