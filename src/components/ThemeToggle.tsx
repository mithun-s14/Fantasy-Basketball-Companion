"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/@components/motion/tabs";

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
    <Tabs value={theme} onValueChange={(v) => choose(v as Theme)} variant="segment">
      <TabsList>
        {(["light", "dark"] as const).map((t) => (
          <TabsTrigger key={t} value={t} className="h-[30px] px-2.5 text-xs capitalize">
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
