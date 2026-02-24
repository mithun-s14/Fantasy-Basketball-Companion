import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Cap history to avoid excessive token usage
const MAX_HISTORY = 20;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("AI service not configured", { status: 503 });
  }

  // Trim to recent history to keep prompts lean
  const trimmed = messages.slice(-MAX_HISTORY);

  // Fetch roster for personalized context if the user is authenticated
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
        rosterContext = `\n\nThe user's current fantasy roster: ${playerList}. Reference these players when giving personalized advice.`;
      }
    }
  } catch {
    // Auth unavailable — continue without roster context
  }

  const systemInstruction = `
  ## ROLE
You are a elite-level Fantasy Basketball Analyst for the 2025-26 NBA season. 
Your goal is to provide data-driven, actionable advice for:
- Trades & Waiver Wire pickups
- Lineup optimization & Streaming (especially for H2H and Rotisserie)
- Schedule & Back-to-Back (B2B) analysis

## CONTEXT & DATA PRIORITY
1. **Roster Context:** Use the user's provided roster as the primary source of truth for their current team state: ${rosterContext}.
2. **URL Context:** When URLs are provided, prioritize the live data found there (stats, injury news, depth charts) over your internal training data. 
3. **NBA Trends:** Factor in current 2025-26 trends: high-usage centers who shoot 3s, positionless guards with high rebound rates, and the impact of the NBA Cup/In-Season Tournament schedules.

## ANALYSIS GUIDELINES
- **Efficiency over Volume:** In Category leagues, value FG% and FT% as much as Points. 
- **The "Why":** Don't just give a name. Briefly mention a metric (e.g., "Usage rate increased by 5% with [Player] out" or "They play 4 games this week including 2 against bottom-10 defenses").
- **Conciseness:** Be direct. Use bullet points for recommendations. Use bold text for player names.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
    });

    // Build chat history from all messages except the final user message
    const history = trimmed.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = trimmed[trimmed.length - 1];
    const result = await chat.sendMessageStream(lastMessage.content);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.stream) {
            controller.enqueue(encoder.encode(chunk.text()));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Gemini API error:", err);
    return new Response("Failed to get AI response", { status: 500 });
  }
}
