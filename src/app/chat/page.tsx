"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Bot, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Who should I pick up off waivers this week?",
  "Should I trade for a high-volume player with a tough schedule?",
  "Which teams have the most games in the next 7 days?",
  "How do I optimize my lineup for a playoff push?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error ${response.status}`);
      }

      // Append an empty assistant bubble, then stream text into it
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + chunk },
          ];
        });
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
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-black/[0.06] px-6 py-4 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors duration-150 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-600" />
            <span className="font-semibold text-gray-900 text-sm tracking-tight">
              AI Coach
            </span>
          </div>
          {/* Spacer to keep title centered */}
          <div className="w-16" />
        </div>
      </nav>

      {/* Chat */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 pt-6 pb-4 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 mb-4 pr-1">
          {/* Bot greeting */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm shadow-sm border border-black/[0.06]">
              <p className="text-sm text-gray-700 leading-relaxed">
                Hey! I&apos;m your AI fantasy coach. Ask me anything — trades,
                waiver pickups, streaming targets, lineup decisions. I&apos;ve
                got you covered.
              </p>
            </div>
          </div>

          {/* Suggested questions (only before first message) */}
          {messages.length === 0 && (
            <div className="ml-11">
              <p className="text-xs text-gray-400 mb-2.5 font-medium">
                Suggested questions
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={isStreaming}
                    className="text-left text-xs text-gray-600 bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 hover:bg-gray-50 hover:border-gray-200 transition-colors duration-150 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="bg-gray-900 rounded-2xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-white leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg shadow-sm border border-black/[0.06]">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    {isStreaming && i === messages.length - 1 && (
                      <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />
                    )}
                  </p>
                </div>
              </div>
            )
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-black/[0.06] px-4 py-3 shrink-0">
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
              className="flex-1 text-sm text-gray-700 outline-none placeholder:text-gray-400 bg-transparent"
              disabled={isStreaming}
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40 shrink-0"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
