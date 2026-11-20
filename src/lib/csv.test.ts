import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, and blank lines", () => {
    const csv = 'Player,Team,PTS\r\n"Doe, John","Say ""hi""",25.1\r\n\r\nJane,LAL,19\n';
    expect(parseCsv(csv)).toEqual([
      ["Player", "Team", "PTS"],
      ["Doe, John", 'Say "hi"', "25.1"],
      ["Jane", "LAL", "19"],
    ]);
  });
});
