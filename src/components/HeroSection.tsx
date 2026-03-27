"use client"

import Link from "next/link"
import { useRef, useCallback } from "react"
import { PixelTrail } from "@/components/ui/pixel-trail"

const PIXEL_SIZE = 28

interface Props {
  isLoggedIn: boolean
}

export function HeroSection({ isLoggedIn }: Props) {
  // Points to the wrapper around PixelTrail's rendered container
  const pixelWrapperRef = useRef<HTMLDivElement>(null)

  // Section-level mouse handler — fires for ALL movements within the section,
  // including over buttons and text, because events bubble up from children.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const wrapper = pixelWrapperRef.current
    if (!wrapper) return
    // PixelTrail renders a single root div; that's wrapper's first child
    const container = wrapper.firstElementChild as HTMLElement | null
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / PIXEL_SIZE)
    const y = Math.floor((e.clientY - rect.top) / PIXEL_SIZE)

    // PixelTrail renders: container > [row divs] > [PixelDot motion.divs]
    const row = container.children[y]
    const pixel = row?.children[x] as any
    pixel?.__animatePixel?.()
  }, [])

  return (
    <section
      className="relative bg-[#0C0C0C] overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(242,100,25,0.18),transparent)]" />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/*
        Pixel trail layer.
        - pointer-events-none on the wrapper ensures this layer is invisible to click hit-testing.
        - className="pointer-events-none" passed to PixelTrail: tailwind-merge (inside cn())
          resolves the conflict with PixelTrail's hardcoded pointer-events-auto, keeping none.
        - Mouse tracking is handled externally via the section's onMouseMove above.
      */}
      <div ref={pixelWrapperRef} className="absolute inset-0 z-[5] pointer-events-none">
        <PixelTrail
          pixelSize={PIXEL_SIZE}
          fadeDuration={600}
          pixelClassName="bg-[#F26419]/35"
          className="pointer-events-none"
        />
      </div>

      {/* Content — z-[10] sits above the pixel layer */}
      <div className="relative z-[10] max-w-6xl mx-auto px-6 pt-20 pb-28">
        <div className="grid lg:grid-cols-[1fr_480px] gap-16 items-center">

          {/* ── Left: copy ── */}
          <div>
            <div className="inline-flex items-center gap-2 bg-[#F26419]/10 border border-[#F26419]/25 rounded-full px-4 py-1.5 mb-9">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F26419] animate-pulse" />
              <span className="text-xs text-[#F26419] font-semibold tracking-widest uppercase">
                2025–26 NBA Season Live
              </span>
            </div>

            <h1
              className="text-[clamp(2.8rem,5.5vw,4.5rem)] font-extrabold text-white leading-none mb-6"
              style={{ letterSpacing: "-0.035em" }}
            >
              Stop guessing.<br />
              <span style={{ color: "#F26419" }}>Start winning.</span>
            </h1>

            <p className="text-[1.1rem] text-gray-400 leading-relaxed mb-10 max-w-md">
              Real-time schedule data, AI-powered lineup advice, and head-to-head matchup
              breakdowns — everything you need to outmanage your fantasy league.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={isLoggedIn ? "/analyzer" : "/auth"}
                className="inline-flex items-center gap-2 bg-[#F26419] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#d95a17] transition-colors duration-200"
              >
                {isLoggedIn ? "Open App" : "Get Started Free"}
                <ArrowIcon />
              </Link>
              <Link
                href="/analyzer"
                className="inline-flex items-center gap-2 bg-white/7 text-white border border-white/10 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-white/12 transition-colors duration-200"
              >
                Try Schedule Analyzer
              </Link>
            </div>
          </div>

          {/* ── Right: floating cards ── */}
          <div className="relative h-100 hidden lg:block">
            {/* Schedule card */}
            <div className="absolute top-6 left-0 bg-white rounded-2xl shadow-2xl shadow-black/50 p-5 w-67 border border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Mar 10–16 · Game Count
              </p>
              {[
                { team: "BOS Celtics", g: 5, cls: "bg-green-100 text-green-700" },
                { team: "GSW Warriors", g: 4, cls: "bg-green-100 text-green-700" },
                { team: "LAL Lakers",   g: 4, cls: "bg-green-100 text-green-700" },
                { team: "DEN Nuggets",  g: 3, cls: "bg-yellow-100 text-yellow-700" },
                { team: "MIA Heat",     g: 2, cls: "bg-yellow-100 text-yellow-700" },
                { team: "CHI Bulls",    g: 1, cls: "bg-red-100 text-red-700" },
              ].map((r) => (
                <div key={r.team} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-[13px] text-gray-700 font-medium">{r.team}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.cls}`}>{r.g}G</span>
                </div>
              ))}
            </div>

            {/* Projected win badge */}
            <div className="absolute top-0 right-10 bg-[#F26419] rounded-2xl shadow-xl p-4 w-32.5">
              <p className="text-[9px] text-white/70 font-bold uppercase tracking-widest mb-0.5">Projected</p>
              <p className="text-[2.2rem] font-extrabold text-white leading-none">6–3</p>
              <p className="text-[11px] text-white/70 mt-0.5">Category wins</p>
            </div>

            {/* AI bubble */}
            <div className="absolute bottom-6 right-0 bg-[#111] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 p-4 w-62">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 bg-[#F26419] rounded-full flex items-center justify-center">
                  <SparkleIcon className="w-3 h-3 text-white" />
                </div>
                <span className="text-[12px] font-semibold text-white">AI Coach</span>
                <span className="ml-auto text-[10px] text-gray-600">just now</span>
              </div>
              <p className="text-[12px] text-gray-300 leading-relaxed">
                Start <span className="text-[#F26419] font-semibold">Tatum</span> — Celtics have 4 games vs Miami&apos;s 2. Clear weekly advantage. 🏆
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

function ArrowIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  )
}
function SparkleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}
