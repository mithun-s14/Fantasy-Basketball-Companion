"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Bot, Send, Sparkles } from "lucide-react";

const SUGGESTED_QUESTIONS = [
  "Who should I pick up off waivers this week?",
  "Should I trade for a high-volume player with a tough schedule?",
  "Which teams have the most games in the next 7 days?",
  "How do I optimize my lineup for a playoff push?",
];

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-black/6 px-6 py-4">
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
            <span className="font-semibold text-gray-900 text-sm tracking-tight">AI Coach</span>
          </div>
          {/* Spacer to keep title centered */}
          <div className="w-16" />
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Coming soon state */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <Bot className="w-8 h-8 text-orange-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-full px-3.5 py-1 mb-4">
            <Sparkles className="w-3 h-3 text-orange-500" />
            <span className="text-xs text-orange-700 font-semibold uppercase tracking-wide">Coming Soon</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
            Your AI Fantasy Coach
          </h1>
          <p className="text-gray-500 max-w-sm mx-auto text-[15px] leading-relaxed">
            An AI powered coach that gives you personalized fantasy basketball advice: trades, waiver pickups, and strategic lineup decisions.
          </p>
        </div>

        {/* Mock chat window */}
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-sm border border-black/[0.06] overflow-hidden">
          {/* Messages area */}
          <div className="h-72 p-6 flex flex-col gap-5 overflow-hidden">
            {/* Bot greeting */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                <p className="text-sm text-gray-700 leading-relaxed">
                  Hey! I'm your AI fantasy coach. Ask me anything: trades, waiver
                  pickups, streaming targets, lineup decisions. I've got you covered.
                </p>
              </div>
            </div>

            {/* Suggested questions */}
            <div className="ml-11">
              <p className="text-xs text-gray-400 mb-2.5 font-medium">Suggested questions</p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    disabled
                    className="text-left text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 cursor-not-allowed hover:bg-gray-100 transition-colors duration-150 line-clamp-1"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="border-t border-gray-50 px-6 py-2.5 bg-gray-50/60 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-xs text-gray-400 font-medium">AI Coach is being set up, check back soon</span>
          </div>

          {/* Input area */}
          <div className="border-t border-black/[0.06] p-4">
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
              <input
                type="text"
                placeholder="Ask about trades, pickups, streaming targets..."
                className="flex-1 bg-transparent text-sm text-gray-400 outline-none placeholder:text-gray-400 cursor-not-allowed"
                disabled
              />
              <button
                disabled
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 text-gray-300" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
