"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Reads the theme the pre-paint script in layout.tsx already applied. */
function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * Light/Dark segmented control (spec 2, Topbar).
 *
 * The `dark` class travels with `data-theme` because the shadcn ui/ components
 * are styled with Tailwind `dark:` variants, which key off the class.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // The server cannot know the stored choice, so adopt it after mount.
  useEffect(() => setTheme(currentTheme()), []);

  const choose = (next: Theme) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", next);
    root.classList.toggle("dark", next === "dark");
    setTheme(next);
    try {
      localStorage.setItem("fbc-theme", next);
    } catch {
      // Private mode or blocked storage — the choice just will not persist.
    }
  };

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex flex-none overflow-hidden rounded-md border border-[var(--border-strong)]"
    >
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => choose(t)}
          aria-pressed={theme === t}
          className={`h-[30px] px-2.5 text-xs capitalize transition-colors first:border-r first:border-[var(--border)] ${
            theme === t
              ? "bg-[var(--accent-soft)] text-[var(--text)]"
              : "text-[var(--text-2)] hover:text-[var(--text)]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
