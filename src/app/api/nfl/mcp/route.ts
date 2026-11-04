import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpRateLimiter } from "@/lib/rate-limiter";
import { createNflMcpServer } from "@/nfl/mcp";

// Remote MCP endpoint for Claude / ChatGPT custom connectors. Stateless: a
// fresh server per request, so it works across serverless instances.
async function handle(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  // Fail open if Redis is down, same as /api/chat.
  const limit = await mcpRateLimiter.limit(ip).catch(() => null);
  if (limit && !limit.success) return new Response("Too many requests", { status: 429 });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createNflMcpServer().connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
