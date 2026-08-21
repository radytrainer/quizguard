import ExcelJS from "exceljs";

import { conflict } from "@/lib/api-response";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";
import type { ParsedFile } from "@/backend/imports/csv-parser";

export async function parseExcel(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw conflict("Could not read this file as an Excel workbook (.xlsx)");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    throw conflict("Excel file has no worksheet data");
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
  });
  if (headers.filter(Boolean).length === 0) {
    throw conflict("Excel file has no header row");
  }

  const dataRowCount = sheet.rowCount - 1;
  if (dataRowCount <= 0) {
    throw conflict("Excel file has no data rows");
  }
  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw conflict(
      `Excel file has ${dataRowCount} rows, which exceeds the ${MAX_IMPORT_ROWS} row limit`,
    );
  }

  const rows: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const record: Record<string, string> = {};
    let hasValue = false;
    for (let col = 1; col < headers.length; col++) {
      const header = headers[col];
      if (!header) continue;
      const text = row.getCell(col).text.trim();
      record[header] = text;
      if (text) hasValue = true;
    }
    // Skip fully blank rows (e.g. trailing empty rows Excel sometimes keeps).
    if (hasValue) rows.push(record);
  }

  return { headers: headers.filter(Boolean), rows };
}
