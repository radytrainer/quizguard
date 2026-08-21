import "server-only";

import { google } from "googleapis";

import { conflict } from "@/lib/api-response";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";
import type { ParsedFile } from "@/backend/imports/csv-parser";

/**
 * Requires a Google Cloud OAuth app (Client ID/Secret in .env.local) that this environment
 * does not have configured — see README.md "Google Sheets import setup" for what to create in
 * Google Cloud Console. Every function here fails with a clear 409 rather than a confusing
 * downstream error when credentials are missing, and none of this module's live behavior
 * against Google's actual APIs has been exercised end to end (only unit-testable pure pieces,
 * like readGoogleSheetValues's row-to-record mapping, have real test coverage).
 */
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

// Access-token-only (no refresh token/offline access): this integration only needs Sheets
// access for the duration of one import session, not a persistent connection — see
// docs/ARCHITECTURE.md — Section 9.
const GOOGLE_TOKEN_TTL_SECONDS = 55 * 60;

function requireGoogleCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw conflict(
      "Google Sheets import is not configured on this server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)",
    );
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

function createOAuthClient(redirectUri: string) {
  const { clientId, clientSecret } = requireGoogleCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  return createOAuthClient(redirectUri).generateAuthUrl({
    access_type: "online",
    scope: SCOPES,
    state,
    prompt: "consent",
  });
}

interface GoogleTokens {
  accessToken: string;
  expiresAt: number;
}

function googleTokenKey(userId: string): string {
  return `google-import-token:${userId}`;
}

export async function connectGoogleAccount(
  userId: string,
  redirectUri: string,
  code: string,
): Promise<void> {
  const client = createOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw conflict("Google did not return an access token");
  }

  const data: GoogleTokens = {
    accessToken: tokens.access_token,
    expiresAt:
      tokens.expiry_date ?? Date.now() + GOOGLE_TOKEN_TTL_SECONDS * 1000,
  };
  await redis.set(
    googleTokenKey(userId),
    JSON.stringify(data),
    "EX",
    GOOGLE_TOKEN_TTL_SECONDS,
  );
}

export async function isGoogleAccountConnected(
  userId: string,
): Promise<boolean> {
  return (await redis.get(googleTokenKey(userId))) !== null;
}

export async function disconnectGoogleAccount(userId: string): Promise<void> {
  await redis.del(googleTokenKey(userId));
}

async function requireGoogleAccessToken(userId: string): Promise<string> {
  const raw = await redis.get(googleTokenKey(userId));
  if (!raw) {
    throw conflict("Google account not connected. Connect it and try again.");
  }
  return (JSON.parse(raw) as GoogleTokens).accessToken;
}

function createAuthedClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

/** Wraps a live Google API call so an expired/revoked token surfaces as "reconnect," not a
 * raw Google error, and clears the stale token so isGoogleAccountConnected reflects reality. */
async function callGoogleApi<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const status =
      (error as { code?: number; status?: number })?.code ??
      (error as { code?: number; status?: number })?.status;
    if (status === 401 || status === 403) {
      await disconnectGoogleAccount(userId);
      throw conflict("Google connection expired. Reconnect and try again.");
    }
    throw conflict("Google Sheets request failed. Please try again.");
  }
}

export interface GoogleSpreadsheetSummary {
  id: string;
  name: string;
}

export async function listGoogleSpreadsheets(
  userId: string,
): Promise<GoogleSpreadsheetSummary[]> {
  const accessToken = await requireGoogleAccessToken(userId);
  return callGoogleApi(userId, async () => {
    const drive = google.drive({
      version: "v3",
      auth: createAuthedClient(accessToken),
    });
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id, name)",
      pageSize: 50,
      orderBy: "modifiedTime desc",
    });
    return (res.data.files ?? [])
      .filter((f) => f.id && f.name)
      .map((f) => ({ id: f.id!, name: f.name! }));
  });
}

export async function listGoogleSheetTabs(
  userId: string,
  spreadsheetId: string,
): Promise<string[]> {
  const accessToken = await requireGoogleAccessToken(userId);
  return callGoogleApi(userId, async () => {
    const sheets = google.sheets({
      version: "v4",
      auth: createAuthedClient(accessToken),
    });
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    return (res.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((title): title is string => !!title);
  });
}

/** Converts a Sheets values.get() response — a 2D array with the header as row 0 — into the
 * same {headers, rows} shape the CSV/Excel parsers produce, so all three sources share one
 * downstream preview/validate/commit pipeline. */
export function rowsToParsedFile(values: unknown[][]): ParsedFile {
  if (values.length === 0) throw conflict("Sheet has no data");

  const [headerRow, ...dataRows] = values;
  const headers = headerRow.map((h) => String(h ?? "").trim());
  if (headers.filter(Boolean).length === 0) {
    throw conflict("Sheet has no header row");
  }
  if (dataRows.length === 0) throw conflict("Sheet has no data rows");
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw conflict(
      `Sheet has ${dataRows.length} rows, which exceeds the ${MAX_IMPORT_ROWS} row limit`,
    );
  }

  const rows = dataRows
    .filter((r) => r.some((cell) => String(cell ?? "").trim()))
    .map((r) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        if (header) record[header] = String(r[i] ?? "").trim();
      });
      return record;
    });

  return { headers: headers.filter(Boolean), rows };
}

export async function readGoogleSheetValues(
  userId: string,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<ParsedFile> {
  const accessToken = await requireGoogleAccessToken(userId);
  const values = await callGoogleApi(userId, async () => {
    const sheets = google.sheets({
      version: "v4",
      auth: createAuthedClient(accessToken),
    });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTitle}'`,
    });
    return (res.data.values ?? []) as unknown[][];
  });

  return rowsToParsedFile(values);
}
