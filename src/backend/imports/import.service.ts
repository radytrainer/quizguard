import "server-only";

import { isNull } from "drizzle-orm";

import { forbidden, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  importErrors,
  imports,
  questions,
  type ImportSource,
} from "@/database/schema";
import { createQuestion } from "@/backend/questions/question.service";
import {
  autoDetectMapping,
  parseImportRow,
  type ColumnMapping,
  type ParsedRow,
} from "@/backend/imports/import-row.schema";
import {
  createImportSession,
  deleteImportSession,
  getImportSession,
  updateImportSessionMapping,
  type ImportSessionData,
} from "@/backend/imports/import-session";

export interface ImportPreview {
  sessionId: string;
  source: ImportSource;
  filename: string | null;
  headers: string[];
  mapping: ColumnMapping;
  rows: ParsedRow[];
  summary: { total: number; valid: number; invalid: number };
}

function summarize(rows: ParsedRow[]) {
  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { total: rows.length, valid: rows.length - invalid, invalid };
}

// +2: the source file's header is row 1, so the first data row is row 2 — row numbers shown
// to the teacher should match what they'd count in the original spreadsheet.
function validateAll(session: ImportSessionData): ParsedRow[] {
  const seen = new Set<string>();
  return session.rows.map((raw, index) =>
    parseImportRow(raw, session.mapping, index + 2, seen),
  );
}

export async function startImportPreview(
  source: ImportSource,
  filename: string | null,
  parsed: { headers: string[]; rows: Record<string, string>[] },
  createdBy: string,
): Promise<ImportPreview> {
  const mapping = autoDetectMapping(parsed.headers);
  const session: ImportSessionData = {
    source,
    filename,
    headers: parsed.headers,
    rows: parsed.rows,
    mapping,
    createdBy,
  };
  const sessionId = await createImportSession(session);
  const rows = validateAll(session);

  return {
    sessionId,
    source,
    filename,
    headers: parsed.headers,
    mapping,
    rows,
    summary: summarize(rows),
  };
}

export async function updateImportMapping(
  sessionId: string,
  userId: string,
  mapping: ColumnMapping,
): Promise<ImportPreview> {
  const existing = await getImportSession(sessionId);
  if (!existing) throw notFound("Import session not found or expired");
  if (existing.createdBy !== userId) throw forbidden();

  const updated = await updateImportSessionMapping(sessionId, mapping);
  if (!updated) throw notFound("Import session not found or expired");

  const rows = validateAll(updated);

  return {
    sessionId,
    source: updated.source,
    filename: updated.filename,
    headers: updated.headers,
    mapping: updated.mapping,
    rows,
    summary: summarize(rows),
  };
}

export interface ImportCommitResult {
  importId: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
}

export async function commitImport(
  sessionId: string,
  userId: string,
): Promise<ImportCommitResult> {
  const session = await getImportSession(sessionId);
  if (!session) throw notFound("Import session not found or expired");
  if (session.createdBy !== userId) throw forbidden();

  const rows = validateAll(session);

  // Cross-check against questions that already exist in the bank, not just duplicates within
  // this batch (validateAll only catches the latter).
  const existingQuestions = await db
    .select({ text: questions.text, subject: questions.subject })
    .from(questions)
    .where(isNull(questions.deletedAt));
  const existingKeys = new Set(
    existingQuestions.map(
      (q) => `${q.subject.toLowerCase()}::${q.text.toLowerCase()}`,
    ),
  );
  for (const row of rows) {
    if (!row.question) continue;
    const key = `${row.question.subject.toLowerCase()}::${row.question.text.toLowerCase()}`;
    if (existingKeys.has(key)) {
      row.errors.push("Duplicate question (already in the question bank)");
      row.question = undefined;
    }
  }

  const validRows = rows.filter(
    (r): r is ParsedRow & { question: NonNullable<ParsedRow["question"]> } =>
      !!r.question,
  );
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  // Each row is its own transaction (inside createQuestion) rather than one transaction for
  // the whole batch — a bulk import is expected to have partial success, so one bad row
  // shouldn't roll back everything that already succeeded.
  for (const row of validRows) {
    await createQuestion(row.question, userId);
  }

  const [importRecord] = await db
    .insert(imports)
    .values({
      source: session.source,
      filename: session.filename,
      totalRows: rows.length,
      successCount: validRows.length,
      errorCount: invalidRows.length,
      createdBy: userId,
    })
    .returning();

  if (invalidRows.length > 0) {
    await db.insert(importErrors).values(
      invalidRows.map((row) => ({
        importId: importRecord.id,
        rowNumber: row.rowNumber,
        message: row.errors.join("; "),
        rawData: row.raw,
      })),
    );
  }

  await deleteImportSession(sessionId);

  return {
    importId: importRecord.id,
    totalRows: rows.length,
    successCount: validRows.length,
    errorCount: invalidRows.length,
  };
}
