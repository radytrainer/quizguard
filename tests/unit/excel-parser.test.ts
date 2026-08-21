import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseExcel } from "@/backend/imports/excel-parser";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";

async function buildWorkbook(
  rows: (string | number)[][],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("parseExcel", () => {
  it("parses a well-formed workbook with a header row", async () => {
    const buffer = await buildWorkbook([
      ["question", "option_a", "points"],
      ["What is 2+2?", "4", 2],
    ]);
    const result = await parseExcel(buffer);
    expect(result.headers).toEqual(["question", "option_a", "points"]);
    expect(result.rows).toEqual([
      { question: "What is 2+2?", option_a: "4", points: "2" },
    ]);
  });

  it("skips fully blank trailing rows", async () => {
    const buffer = await buildWorkbook([
      ["question"],
      ["Real question"],
      ["", ""],
    ]);
    const result = await parseExcel(buffer);
    expect(result.rows).toHaveLength(1);
  });

  it("throws when there are no data rows", async () => {
    const buffer = await buildWorkbook([["question"]]);
    await expect(parseExcel(buffer)).rejects.toThrow();
  });

  it("throws on a buffer that isn't a valid workbook", async () => {
    const garbage = new TextEncoder().encode("not an excel file").buffer;
    await expect(parseExcel(garbage as ArrayBuffer)).rejects.toThrow();
  });

  it("throws when the row count exceeds the limit", async () => {
    const rows: string[][] = [["question"]];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) {
      rows.push([`Question ${i}`]);
    }
    const buffer = await buildWorkbook(rows);
    await expect(parseExcel(buffer)).rejects.toThrow();
  });
});
