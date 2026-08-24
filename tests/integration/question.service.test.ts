import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { questions, users } from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import type { AuthUser } from "@/backend/auth/session";
import {
  createQuestion,
  deleteQuestion,
  deleteQuestions,
  getQuestion,
  getQuestionFilterFacets,
  listQuestions,
  updateQuestion,
} from "@/backend/questions/question.service";
import type { QuestionInput } from "@/backend/questions/question.schema";

// Requires `docker compose up -d` (PostgreSQL).
describe("question.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const authorEmail = `question-service-author-${suffix}@quizguard.test`;
  let authorId: string;
  let requester: AuthUser;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");
    const [author] = await db
      .insert(users)
      .values({
        email: authorEmail,
        name: "Test Author",
        role: "teacher",
        passwordHash,
      })
      .returning();
    authorId = author.id;
    requester = {
      id: author.id,
      email: author.email,
      name: author.name,
      role: "teacher",
    };
  });

  afterAll(async () => {
    await db.delete(questions).where(eq(questions.createdBy, authorId));
    await db.delete(users).where(eq(users.id, authorId));
    await pool.end();
  });

  const multipleChoiceInput: QuestionInput = {
    type: "multiple_choice",
    subject: `Integration Subject ${suffix}`,
    category: "Transactions",
    difficulty: "easy",
    points: 2,
    text: "What does SQL ROLLBACK do?",
    explanation: "It undoes uncommitted changes in the current transaction.",
    tags: ["sql", "transactions"],
    options: [
      { text: "Undoes uncommitted changes", isCorrect: true },
      { text: "Permanently deletes the table", isCorrect: false },
      { text: "Creates a savepoint", isCorrect: false },
    ],
  };

  it("creates a question with its options in one transaction", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);

    expect(created.subject).toBe(multipleChoiceInput.subject);
    expect(created.options).toHaveLength(3);
    expect(created.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  it("round-trips through getQuestion with options in position order", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);
    const fetched = await getQuestion(created.id, requester);

    expect(fetched.id).toBe(created.id);
    expect(fetched.options.map((o) => o.text)).toEqual(
      multipleChoiceInput.options.map((o) => o.text),
    );
  });

  it("forces isCorrect=true for short_answer options with no client-supplied flag", async () => {
    const created = await createQuestion(
      {
        type: "short_answer",
        subject: `Integration Subject ${suffix}`,
        text: "What is 6 * 7?",
        tags: [],
        points: 1,
        difficulty: "easy",
        options: [{ text: "42" }, { text: "forty-two" }],
      },
      authorId,
    );

    expect(created.options.every((o) => o.isCorrect)).toBe(true);
  });

  it("replaces all options on update rather than merging", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);

    const updated = await updateQuestion(
      created.id,
      {
        ...multipleChoiceInput,
        options: [
          { text: "Only option now", isCorrect: true },
          { text: "Distractor", isCorrect: false },
        ],
      },
      requester,
    );

    expect(updated.options).toHaveLength(2);
    expect(updated.options.map((o) => o.text)).toEqual([
      "Only option now",
      "Distractor",
    ]);
  });

  it("soft-deletes: getQuestion 404s afterward, row still exists in the DB", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);

    await deleteQuestion(created.id, requester);

    await expect(getQuestion(created.id, requester)).rejects.toMatchObject({
      status: 404,
    });

    const [row] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, created.id));
    expect(row).toBeDefined();
    expect(row.deletedAt).not.toBeNull();
  });

  it("404s deleting a question that doesn't exist", async () => {
    await expect(deleteQuestion(randomUUID(), requester)).rejects.toMatchObject(
      {
        status: 404,
        code: "NOT_FOUND",
      },
    );
  });

  it("bulk-deletes multiple questions in one call and reports how many", async () => {
    const first = await createQuestion(multipleChoiceInput, authorId);
    const second = await createQuestion(multipleChoiceInput, authorId);

    const deletedCount = await deleteQuestions(
      [first.id, second.id],
      requester,
    );
    expect(deletedCount).toBe(2);

    await expect(getQuestion(first.id, requester)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getQuestion(second.id, requester)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("bulk-delete silently skips ids that are already deleted or don't exist", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);
    await deleteQuestion(created.id, requester);

    // Mixes an already-deleted id, a nonexistent id, and one real, currently-active id — only
    // the last should actually count, and none of it should throw.
    const stillActive = await createQuestion(multipleChoiceInput, authorId);
    const deletedCount = await deleteQuestions(
      [created.id, randomUUID(), stillActive.id],
      requester,
    );
    expect(deletedCount).toBe(1);
  });

  it("filters listQuestions by subject, difficulty, and tag", async () => {
    await createQuestion(multipleChoiceInput, authorId);
    await createQuestion(
      { ...multipleChoiceInput, difficulty: "hard", tags: ["indexes"] },
      authorId,
    );

    const bySubject = await listQuestions(
      {
        subject: multipleChoiceInput.subject,
        page: 1,
        pageSize: 50,
      },
      requester,
    );
    expect(bySubject.total).toBeGreaterThanOrEqual(2);

    const byDifficulty = await listQuestions(
      {
        subject: multipleChoiceInput.subject,
        difficulty: "hard",
        page: 1,
        pageSize: 50,
      },
      requester,
    );
    expect(byDifficulty.items.every((q) => q.difficulty === "hard")).toBe(true);

    const byTag = await listQuestions(
      {
        subject: multipleChoiceInput.subject,
        tag: "indexes",
        page: 1,
        pageSize: 50,
      },
      requester,
    );
    expect(byTag.items.length).toBeGreaterThanOrEqual(1);
    expect(byTag.items.every((q) => q.tags.includes("indexes"))).toBe(true);
  });

  it("search matches question text case-insensitively", async () => {
    await createQuestion(multipleChoiceInput, authorId);

    const result = await listQuestions(
      {
        search: "rollback",
        page: 1,
        pageSize: 50,
      },
      requester,
    );

    expect(
      result.items.some((q) => q.text.toLowerCase().includes("rollback")),
    ).toBe(true);
  });

  it("excludes soft-deleted questions from list results", async () => {
    const created = await createQuestion(multipleChoiceInput, authorId);
    await deleteQuestion(created.id, requester);

    const result = await listQuestions(
      {
        subject: multipleChoiceInput.subject,
        page: 1,
        pageSize: 100,
      },
      requester,
    );

    expect(result.items.some((q) => q.id === created.id)).toBe(false);
  });

  it("returns distinct subjects/categories for filter facets", async () => {
    await createQuestion(multipleChoiceInput, authorId);

    const facets = await getQuestionFilterFacets(requester);

    expect(facets.subjects).toContain(multipleChoiceInput.subject);
    expect(facets.categories).toContain("Transactions");
  });
});
