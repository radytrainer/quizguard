import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { redis } from "@/lib/redis";
import { importErrors, imports, questions, users } from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import { parseCsv } from "@/backend/imports/csv-parser";
import {
  commitImport,
  startImportPreview,
  updateImportMapping,
} from "@/backend/imports/import.service";

// Requires `docker compose up -d` (PostgreSQL + Redis).
describe("import.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const authorEmail = `import-service-author-${suffix}@quizguard.test`;
  const subject = `Import Subject ${suffix}`;
  let authorId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");
    const [author] = await db
      .insert(users)
      .values({
        email: authorEmail,
        name: "Import Test Author",
        role: "teacher",
        passwordHash,
      })
      .returning();
    authorId = author.id;
  });

  afterAll(async () => {
    const createdImports = await db
      .select({ id: imports.id })
      .from(imports)
      .where(eq(imports.createdBy, authorId));
    for (const { id } of createdImports) {
      await db.delete(importErrors).where(eq(importErrors.importId, id));
    }
    await db.delete(imports).where(eq(imports.createdBy, authorId));
    await db.delete(questions).where(eq(questions.createdBy, authorId));
    await db.delete(users).where(eq(users.id, authorId));
    await pool.end();
    redis.disconnect();
  });

  function csvWithSubject(overrides = "") {
    return (
      "question,option_a,option_b,correct_answer,points,subject\n" +
      `What does ROLLBACK do?,Undo changes,Delete table,a,2,${subject}\n` +
      overrides
    );
  }

  it("previews a CSV with auto-detected mapping and per-row validation", async () => {
    const parsed = parseCsv(csvWithSubject());
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );

    expect(preview.mapping.question).toBe("question");
    expect(preview.mapping.correct_answer).toBe("correct_answer");
    expect(preview.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it("surfaces a validation error in the preview without touching the database", async () => {
    const parsed = parseCsv(csvWithSubject("What is 2+2?,,,,,\n"));
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );

    expect(preview.summary.invalid).toBe(1);
    const badRow = preview.rows.find((r) => r.errors.length > 0);
    expect(badRow?.errors).toContain("Missing subject");

    const existing = await db
      .select()
      .from(questions)
      .where(eq(questions.createdBy, authorId));
    expect(existing).toHaveLength(0);
  });

  it("re-validates after a mapping update", async () => {
    // Header uses a non-standard name for the question column so auto-detect misses it.
    const parsed = parseCsv(
      "prompt,option_a,option_b,correct_answer,subject\n" +
        `What does COMMIT do?,Save changes,Undo changes,a,${subject}\n`,
    );
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );
    expect(preview.mapping.question).toBeNull();
    expect(preview.summary.invalid).toBe(1);

    const remapped = await updateImportMapping(preview.sessionId, authorId, {
      ...preview.mapping,
      question: "prompt",
    });
    expect(remapped.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
  });

  it("rejects a mapping update from a different user", async () => {
    const parsed = parseCsv(csvWithSubject());
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );

    await expect(
      updateImportMapping(preview.sessionId, randomUUID(), preview.mapping),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("commits valid rows as questions and records an imports audit row", async () => {
    const parsed = parseCsv(csvWithSubject());
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );

    const result = await commitImport(preview.sessionId, authorId);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);

    const created = await db
      .select()
      .from(questions)
      .where(eq(questions.subject, subject));
    expect(created.some((q) => q.text === "What does ROLLBACK do?")).toBe(true);

    const [importRecord] = await db
      .select()
      .from(imports)
      .where(eq(imports.id, result.importId));
    expect(importRecord.successCount).toBe(1);
    expect(importRecord.source).toBe("csv");
  });

  it("deletes the Redis session after commit", async () => {
    const parsed = parseCsv(csvWithSubject());
    const preview = await startImportPreview(
      "csv",
      "questions.csv",
      parsed,
      authorId,
    );
    await commitImport(preview.sessionId, authorId);

    await expect(
      updateImportMapping(preview.sessionId, authorId, preview.mapping),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects committing an already-existing question and records the error", async () => {
    // First import establishes the question in the bank.
    const firstParsed = parseCsv(csvWithSubject());
    const firstPreview = await startImportPreview(
      "csv",
      "questions.csv",
      firstParsed,
      authorId,
    );
    await commitImport(firstPreview.sessionId, authorId);

    // Second import of the identical question should be rejected as a duplicate at commit
    // time (this is a fresh preview, so the within-batch dedupe check doesn't catch it).
    const secondParsed = parseCsv(csvWithSubject());
    const secondPreview = await startImportPreview(
      "csv",
      "questions.csv",
      secondParsed,
      authorId,
    );
    const result = await commitImport(secondPreview.sessionId, authorId);

    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);

    const errors = await db
      .select()
      .from(importErrors)
      .where(eq(importErrors.importId, result.importId));
    expect(errors[0].message).toContain("Duplicate question");
  });
});
