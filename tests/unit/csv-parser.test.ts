import { describe, expect, it } from "vitest";

import { parseCsv } from "@/backend/imports/csv-parser";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";

describe("parseCsv", () => {
  it("parses a well-formed CSV with a header row", () => {
    const result = parseCsv("question,option_a,option_b\nWhat is 2+2?,3,4\n");
    expect(result.headers).toEqual(["question", "option_a", "option_b"]);
    expect(result.rows).toEqual([
      { question: "What is 2+2?", option_a: "3", option_b: "4" },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsv('question,option_a\n"What is 1, plus 1?",2\n');
    expect(result.rows[0].question).toBe("What is 1, plus 1?");
  });

  it("throws when the file has no data rows", () => {
    expect(() => parseCsv("question,option_a\n")).toThrow();
  });

  it("throws when the file is empty", () => {
    expect(() => parseCsv("")).toThrow();
  });

  it("throws when the row count exceeds the limit", () => {
    const header = "question\n";
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, i) => `Question ${i}`,
    ).join("\n");
    expect(() => parseCsv(header + rows)).toThrow();
  });
});
