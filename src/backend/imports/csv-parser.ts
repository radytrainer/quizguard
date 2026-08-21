import Papa from "papaparse";

import { conflict } from "@/lib/api-response";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedFile {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw conflict(`Could not parse CSV: ${result.errors[0].message}`);
  }
  if (!result.meta.fields || result.meta.fields.length === 0) {
    throw conflict("CSV file has no header row");
  }
  if (result.data.length === 0) {
    throw conflict("CSV file has no data rows");
  }
  if (result.data.length > MAX_IMPORT_ROWS) {
    throw conflict(
      `CSV has ${result.data.length} rows, which exceeds the ${MAX_IMPORT_ROWS} row limit`,
    );
  }

  return { headers: result.meta.fields, rows: result.data };
}
