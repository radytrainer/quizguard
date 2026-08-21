// Shared safety limits for every import source (CSV, Excel, Google Sheets) — Section 25's
// "file upload validation" / "file size limits" and Section 9's "do not trust uploaded data,"
// applied uniformly so no single parser can be used to bypass them.
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 2000;
