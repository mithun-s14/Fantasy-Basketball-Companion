import express from "express";
import Redis from "ioredis";
import pino from "pino";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { registry, chatRequestsTotal, chatLatencyMs, rateLimitHitsTotal } from "./metrics";

// Structured JSON logger — every log line is a parseable JSON object.
// In production these stream to a log aggregator (Loki, Cloud Logging, etc.).
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3001;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;
const MAX_HISTORY = 20;

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch((err) => {
  logger.error({ err }, "Redis connection failed — rate limiting will be unavailable");
});

// ── Health probes ─────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await redis.ping();
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "redis unavailable" });
  }
});

// ── Prometheus metrics endpoint ───────────────────────────────────────────────
// Prometheus scrapes this URL on the interval defined in the ServiceMonitor.
// Returns all registered metrics in the Prometheus text exposition format.
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});

// ── Sliding-window rate limiter ───────────────────────────────────────────────
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const key = `rate_limit:chat:${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, String(now));
    pipeline.pexpire(key, RATE_WINDOW_MS);
    const results = await pipeline.exec();

    const count = results?.[1]?.[1] as number;
    if (count >= RATE_LIMIT) {
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestTs = oldest[1] ? parseInt(oldest[1]) : now;
      const retryAfterSeconds = Math.ceil((oldestTs + RATE_WINDOW_MS - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

// ── Chat endpoint ─────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
}

app.post("/chat", async (req, res) => {
  // Start the latency timer immediately — we want to measure the full handler time.
  const stopTimer = chatLatencyMs.startTimer();

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ??
    req.socket.remoteAddress ??
    "unknown";

  const { allowed, retryAfterSeconds } = await checkRateLimit(ip);
  if (!allowed) {
    rateLimitHitsTotal.inc();
    chatRequestsTotal.inc({ status: "rate_limited" });
    stopTimer();
    res
      .status(429)
      .set({ "Retry-After": String(retryAfterSeconds), "X-RateLimit-Limit": String(RATE_LIMIT) })
      .send("Too many requests. Please wait before sending another message.");
    return;
  }

  const { messages, rosterContext } = req.body as {
    messages: Message[];
    rosterContext?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    chatRequestsTotal.inc({ status: "error" });
    stopTimer();
    res.status(400).send("Invalid messages");
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    chatRequestsTotal.inc({ status: "error" });
    stopTimer();
    res.status(503).send("AI service not configured");
    return;
  }

  const trimmed = messages.slice(-MAX_HISTORY);

  const systemPrompt = `## ROLE
You are an elite-level Fantasy Basketball Analyst for the 2025-26 NBA season.
Your goal is to provide data-driven, actionable advice for:
- Trades & Waiver Wire pickups
- Lineup optimization & Streaming (especially for H2H and Rotisserie)
- Schedule & Back-to-Back (B2B) analysis

## CONTEXT & DATA PRIORITY
1. **Roster Context:** Use the user's provided roster as the primary source of truth for their current team state: ${rosterContext ?? "No roster provided."}.
2. **URL Context:** When URLs are provided, prioritize the live data found there over your internal training data.
3. **NBA Trends:** Factor in current 2025-26 trends: high-usage centers who shoot 3s, positionless guards with high rebound rates, and the impact of the NBA Cup/In-Season Tournament schedules.

## ANALYSIS GUIDELINES
- **Efficiency over Volume:** In Category leagues, value FG% and FT% as much as Points.
- **The "Why":** Don't just give a name. Briefly mention a metric.
- **Conciseness:** Be direct and brief. Use bullet points for recommendations.`;

  try {
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey,
      streaming: true,
    });

    const chatHistory = new InMemoryChatMessageHistory();
    for (const m of trimmed.slice(0, -1)) {
      await chatHistory.addMessage(
        m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
      );
    }

    const langchainMessages = [
      new SystemMessage(systemPrompt),
      ...(await chatHistory.getMessages()),
      new HumanMessage(trimmed[trimmed.length - 1].content),
    ];

    const responseStream = await model.stream(langchainMessages);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    for await (const chunk of responseStream) {
      const text = typeof chunk.content === "string" ? chunk.content : "";
      res.write(text);
    }

    chatRequestsTotal.inc({ status: "success" });
    stopTimer();
    res.end();
  } catch (err) {
    logger.error({ err }, "LangChain/Gemini error");
    chatRequestsTotal.inc({ status: "error" });
    stopTimer();
    if (!res.headersSent) {
      res.status(500).send("Failed to get AI response");
    }
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, "ai-service listening");
});
