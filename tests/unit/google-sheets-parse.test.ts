import { describe, expect, it } from "vitest";

import { rowsToParsedFile } from "@/backend/imports/google-sheets.service";

describe("rowsToParsedFile", () => {
  it("converts a values.get()-shaped 2D array into headers + row records", () => {
    const result = rowsToParsedFile([
      ["question", "option_a", "option_b"],
      ["What is 2+2?", "3", "4"],
    ]);
    expect(result.headers).toEqual(["question", "option_a", "option_b"]);
    expect(result.rows).toEqual([
      { question: "What is 2+2?", option_a: "3", option_b: "4" },
    ]);
  });

  it("skips fully blank rows", () => {
    const result = rowsToParsedFile([
      ["question"],
      ["Real question"],
      ["", ""],
    ]);
    expect(result.rows).toHaveLength(1);
  });

  it("throws when there is no data at all", () => {
    expect(() => rowsToParsedFile([])).toThrow();
  });

  it("throws when there is a header but no data rows", () => {
    expect(() => rowsToParsedFile([["question"]])).toThrow();
  });

  it("handles short rows (missing trailing cells) without throwing", () => {
    const result = rowsToParsedFile([
      ["question", "option_a", "option_b"],
      ["Short row"],
    ]);
    expect(result.rows[0]).toEqual({
      question: "Short row",
      option_a: "",
      option_b: "",
    });
  });
});
