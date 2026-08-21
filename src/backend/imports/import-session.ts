import "server-only";

import { randomBytes } from "node:crypto";

import { redis } from "@/lib/redis";
import type { ImportSource } from "@/database/schema";
import type { ColumnMapping } from "@/backend/imports/import-row.schema";

/**
 * The preview -> remap -> commit loop's working state lives here, not in PostgreSQL — it's
 * disposable (a re-upload regenerates it) and short-lived by design, exactly the kind of
 * temporary state docs/ARCHITECTURE.md — Section 3 reserves Redis for. Only a *committed*
 * import (backend/imports/import.service.ts#commitImport) writes to PostgreSQL.
 */
export interface ImportSessionData {
  source: ImportSource;
  filename: string | null;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  createdBy: string;
}

const SESSION_TTL_SECONDS = 30 * 60;

function sessionKey(id: string): string {
  return `import-session:${id}`;
}

export async function createImportSession(
  data: ImportSessionData,
): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  await redis.set(
    sessionKey(id),
    JSON.stringify(data),
    "EX",
    SESSION_TTL_SECONDS,
  );
  return id;
}

export async function getImportSession(
  id: string,
): Promise<ImportSessionData | null> {
  const raw = await redis.get(sessionKey(id));
  return raw ? (JSON.parse(raw) as ImportSessionData) : null;
}

export async function updateImportSessionMapping(
  id: string,
  mapping: ColumnMapping,
): Promise<ImportSessionData | null> {
  const session = await getImportSession(id);
  if (!session) return null;

  const updated: ImportSessionData = { ...session, mapping };
  await redis.set(
    sessionKey(id),
    JSON.stringify(updated),
    "EX",
    SESSION_TTL_SECONDS,
  );
  return updated;
}

export async function deleteImportSession(id: string): Promise<void> {
  await redis.del(sessionKey(id));
}
