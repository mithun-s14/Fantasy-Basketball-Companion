"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

// Filters as you type by rewriting ?q= (keeps sort/dir); the server page does the filtering.
export function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Input
      type="search"
      defaultValue={params.get("q") ?? ""}
      placeholder="Search player…"
      aria-label="Search players"
      className="sm:w-60"
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value.trim()) next.set("q", e.target.value);
        else next.delete("q");
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
    />
  );
}
