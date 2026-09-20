// Decision engines only choose which tool to run. Arguments are resolved here,
// deterministically, from the user's message and their roster.

export interface PlayerRef {
  name: string;
  team: string;
}

/** Initials a fan would type: "SGA", "KAT", "CP". Two or more name parts only. */
function initialsOf(name: string): string | null {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.map((p) => p[0]).join("").toUpperCase();
}

function normalize(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

/**
 * Finds players named in the message: full name, unambiguous last name, or
 * initials. Falls back to the user's roster when the message names nobody.
 */
export function resolvePlayers(
  message: string,
  activePlayers: PlayerRef[],
  rosterPlayers: PlayerRef[] = []
): PlayerRef[] {
  const haystack = normalize(message);
  const upperTokens = new Set(message.match(/\b[A-Z]{2,4}\b/g) ?? []);
  const matched = new Map<string, PlayerRef>();

  // Last names are only usable when exactly one active player has them
  const lastNameCounts = new Map<string, number>();
  for (const player of activePlayers) {
    const parts = player.name.split(/\s+/);
    const last = normalize(parts[parts.length - 1]);
    lastNameCounts.set(last, (lastNameCounts.get(last) ?? 0) + 1);
  }

  for (const player of activePlayers) {
    const full = normalize(player.name);
    const parts = player.name.split(/\s+/);
    const last = normalize(parts[parts.length - 1]);
    const initials = initialsOf(player.name);

    const namedInFull = haystack.includes(full);
    // Lookarounds, not \b: word boundaries are not Unicode-aware, so a name
    // ending in an accented letter like "Jokić" would never match
    const escaped = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namedByLast =
      lastNameCounts.get(last) === 1 &&
      new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "u").test(haystack);
    const namedByInitials = initials !== null && upperTokens.has(initials);

    if (namedInFull || namedByLast || namedByInitials) {
      matched.set(player.name, player);
    }
  }

  if (matched.size > 0) return [...matched.values()];
  return rosterPlayers;
}

/** Stable key for "this tool already ran with these arguments". */
export function argsKey(players: PlayerRef[]): string {
  return players
    .map((p) => p.name)
    .sort()
    .join("|");
}
