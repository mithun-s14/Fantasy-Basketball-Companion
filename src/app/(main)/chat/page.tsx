"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  warning?: string;
}

// Shown under the message while the agent gathers data
const STEP_LABELS: Record<string, string> = {
  get_roster: "Reading your roster...",
  get_recent_performance: "Checking recent form...",
  get_matchup_stats: "Checking this week's schedule...",
};

const SUGGESTED_QUESTIONS = [
  "Who should I pick up off waivers this week?",
  "Should I trade for a high-volume player with a tough schedule?",
  "How do I optimize my lineup for a playoff push?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);
    setIsThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error ${response.status}`);
      }

      // First chunk is about to arrive — swap thinking indicator for the assistant bubble
      setIsThinking(false);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // With AGENT_MODE on the server sends SSE frames; otherwise it is the
      // original plain-text stream and every chunk is answer text.
      const isEventStream = (response.headers.get("Content-Type") ?? "").includes(
        "text/event-stream"
      );

      const appendToLast = (update: (msg: Message) => Message) =>
        setMessages((prev) => [...prev.slice(0, -1), update(prev[prev.length - 1])]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (!isEventStream) {
          appendToLast((last) => ({ ...last, content: last.content + chunk }));
          continue;
        }

        buffer += chunk;
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const payload = frame.replace(/^data: /, "").trim();
          if (!payload) continue;
          let event: {
            type?: string;
            delta?: string;
            action?: string;
            message?: string;
          };
          try {
            event = JSON.parse(payload);
          } catch {
            continue; // unknown frame, ignore it rather than break the stream
          }

          if (event.type === "text" && event.delta) {
            const delta = event.delta;
            appendToLast((last) => ({ ...last, content: last.content + delta }));
          } else if (event.type === "agent_step" && event.action) {
            const label = STEP_LABELS[event.action] ?? event.action;
            appendToLast((last) => ({ ...last, steps: [...(last.steps ?? []), label] }));
          } else if (event.type === "agent_warning" && event.message) {
            const warning = event.message;
            appendToLast((last) => ({ ...last, warning }));
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn't get a response right now. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chat */}
      {/* 3.5rem is the topbar; the shell already reserves room for the mobile tab bar. */}
      <div className="flex-1 flex flex-col w-full px-4 sm:px-6 pt-6 pb-4 min-h-0 h-[calc(100dvh-3.5rem)] max-[900px]:h-[calc(100dvh-3.5rem-60px)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 mb-4 p-4 rounded-lg border border-border bg-card/40">
          {/* Bot greeting */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary/10 ring-1 ring-primary/30 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm border border-border">
              <p className="text-sm text-foreground/90 leading-relaxed">
                Hey! I&apos;m your AI fantasy coach. Ask me anything — trades,
                waiver pickups, streaming targets, lineup decisions. I&apos;ve
                got you covered.
              </p>
            </div>
          </div>

          {/* Suggested questions (only before first message) */}
          {messages.length === 0 && (
            <div className="ml-11">
              <p className="text-xs text-muted-foreground mb-2.5 font-medium">
                Suggested questions
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={isStreaming}
                    className="text-left text-xs text-muted-foreground bg-card border border-border rounded-lg px-3.5 py-2.5 hover:border-primary/40 hover:text-foreground transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation messages */}
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-primary rounded-2xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-primary-foreground font-medium leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary/10 ring-1 ring-primary/30 rounded-full flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg border border-border">
                  {msg.steps && msg.steps.length > 0 && (
                    <ul className="mb-2 space-y-0.5">
                      {msg.steps.map((step, s) => (
                        <li key={s} className="text-xs text-muted-foreground">{step}</li>
                      ))}
                    </ul>
                  )}
                  <div className="text-sm text-foreground/90 leading-relaxed">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        h1: ({ children }) => <h1 className="font-semibold text-base mb-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="font-semibold mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-medium mb-1">{children}</h3>,
                      }}
                    >{msg.content}</ReactMarkdown>
                    {isStreaming && i === messages.length - 1 && (
                      <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
                    )}
                  </div>
                  {msg.warning && (
                    <p className="mt-2 text-xs text-muted-foreground italic">{msg.warning}</p>
                  )}
                </div>
              </div>
            )
          )}

          {/* Thinking indicator — shown between request and first chunk */}
          {isThinking && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 ring-1 ring-primary/30 rounded-full flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3.5 border border-border">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-card rounded-xl border border-border px-4 py-3 shrink-0 focus-within:border-primary/50 transition-colors">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trades, pickups, streaming targets..."
              className="flex-1 text-sm text-foreground outline-none placeholder:text-muted-foreground bg-transparent"
              disabled={isStreaming}
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 bg-primary rounded-full flex items-center justify-center transition-opacity disabled:opacity-40 shrink-0"
            >
              <Send className="w-3.5 h-3.5 text-primary-foreground" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
