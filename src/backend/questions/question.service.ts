import "server-only";

import {
  and,
  arrayContains,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
} from "drizzle-orm";

import { forbidden, notFound } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  questionOptions,
  questions,
  type Question,
  type QuestionOption,
} from "@/database/schema";
import type { AuthUser } from "@/backend/auth/session";
import type {
  QuestionInput,
  QuestionListQuery,
} from "@/backend/questions/question.schema";
import { assertOwner } from "@/backend/shared/ownership";

export interface QuestionWithOptions extends Question {
  options: QuestionOption[];
}

export interface QuestionListItem {
  id: string;
  type: Question["type"];
  subject: string;
  category: string | null;
  difficulty: Question["difficulty"];
  points: number;
  text: string;
  tags: string[];
  createdAt: Date;
}

export interface QuestionListResult {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// An empty string (a blank form field) means the same thing as an absent value.
function normalizeOptional(value: string | undefined): string | null {
  return value ? value : null;
}

function toOptionRows(input: QuestionInput, questionId: string) {
  return input.options.map((option, index) => ({
    questionId,
    text: option.text,
    // Choice types carry isCorrect; answer types (short_answer/fill_in_blank) don't — every
    // entry there is an accepted answer, so it's correct by definition.
    isCorrect: "isCorrect" in option ? option.isCorrect : true,
    position: index,
  }));
}

export async function createQuestion(
  input: QuestionInput,
  authorId: string,
): Promise<QuestionWithOptions> {
  return db.transaction(async (tx) => {
    const [question] = await tx
      .insert(questions)
      .values({
        type: input.type,
        subject: input.subject,
        category: normalizeOptional(input.category),
        difficulty: input.difficulty,
        points: input.points,
        text: input.text,
        explanation: normalizeOptional(input.explanation),
        tags: input.tags,
        createdBy: authorId,
      })
      .returning();

    const options = await tx
      .insert(questionOptions)
      .values(toOptionRows(input, question.id))
      .returning();

    return { ...question, options };
  });
}

export async function getQuestion(
  id: string,
  requester: AuthUser,
): Promise<QuestionWithOptions> {
  const [question] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .limit(1);

  if (!question) throw notFound("Question not found");
  assertOwner(
    question.createdBy,
    requester,
    "This question does not belong to you",
  );

  const options = await db
    .select()
    .from(questionOptions)
    .where(eq(questionOptions.questionId, id))
    .orderBy(questionOptions.position);

  return { ...question, options };
}

export async function updateQuestion(
  id: string,
  input: QuestionInput,
  requester: AuthUser,
): Promise<QuestionWithOptions> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: questions.id, createdBy: questions.createdBy })
      .from(questions)
      .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
      .limit(1);

    if (!existing) throw notFound("Question not found");
    assertOwner(
      existing.createdBy,
      requester,
      "This question does not belong to you",
    );

    const [question] = await tx
      .update(questions)
      .set({
        type: input.type,
        subject: input.subject,
        category: normalizeOptional(input.category),
        difficulty: input.difficulty,
        points: input.points,
        text: input.text,
        explanation: normalizeOptional(input.explanation),
        tags: input.tags,
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    // Replace-all rather than diff: a question has at most ~10 options, so this is simpler
    // and just as correct as computing an add/update/remove set.
    await tx.delete(questionOptions).where(eq(questionOptions.questionId, id));
    const options = await tx
      .insert(questionOptions)
      .values(toOptionRows(input, id))
      .returning();

    return { ...question, options };
  });
}

export async function deleteQuestion(
  id: string,
  requester: AuthUser,
): Promise<void> {
  const [existing] = await db
    .select({ id: questions.id, createdBy: questions.createdBy })
    .from(questions)
    .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
    .limit(1);

  if (!existing) throw notFound("Question not found");
  assertOwner(
    existing.createdBy,
    requester,
    "This question does not belong to you",
  );

  await db
    .update(questions)
    .set({ deletedAt: new Date() })
    .where(eq(questions.id, id));
}

/** Bulk counterpart to `deleteQuestion` — one UPDATE instead of N round trips. Deliberately
 * forgiving like `unlockAttempt`: an id that's already deleted, doesn't exist, or (for a
 * teacher) belongs to someone else is silently skipped rather than failing the whole batch,
 * since the caller is always an on-screen selection a teacher just made, not a hand-built list
 * worth 404ing over. Returns how many rows were actually deleted so the UI can say so. */
export async function deleteQuestions(
  ids: string[],
  requester: AuthUser,
): Promise<number> {
  const conditions = [inArray(questions.id, ids), isNull(questions.deletedAt)];
  if (requester.role !== "admin") {
    conditions.push(eq(questions.createdBy, requester.id));
  }

  const deleted = await db
    .update(questions)
    .set({ deletedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: questions.id });
  return deleted.length;
}

/** Guards quiz.service.ts's `setQuizQuestionPool` — without this, a teacher could pool another
 * teacher's question-bank questions into their own quiz just by knowing/guessing the ids, even
 * though they can no longer browse or open them directly. */
export async function verifyQuestionsOwnedBy(
  ids: string[],
  teacherId: string,
): Promise<void> {
  if (ids.length === 0) return;

  const owned = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        inArray(questions.id, ids),
        eq(questions.createdBy, teacherId),
        isNull(questions.deletedAt),
      ),
    );

  if (owned.length !== ids.length) {
    throw forbidden("One or more questions do not belong to you");
  }
}

export async function listQuestions(
  query: QuestionListQuery,
  requester: AuthUser,
): Promise<QuestionListResult> {
  const conditions = [isNull(questions.deletedAt)];
  if (requester.role !== "admin") {
    conditions.push(eq(questions.createdBy, requester.id));
  }

  if (query.search) {
    conditions.push(ilike(questions.text, `%${query.search}%`));
  }
  if (query.subject) conditions.push(eq(questions.subject, query.subject));
  if (query.category) conditions.push(eq(questions.category, query.category));
  if (query.difficulty) {
    conditions.push(eq(questions.difficulty, query.difficulty));
  }
  if (query.type) conditions.push(eq(questions.type, query.type));
  if (query.tag) conditions.push(arrayContains(questions.tags, [query.tag]));

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(questions)
    .where(where);

  const items = await db
    .select({
      id: questions.id,
      type: questions.type,
      subject: questions.subject,
      category: questions.category,
      difficulty: questions.difficulty,
      points: questions.points,
      text: questions.text,
      tags: questions.tags,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(where)
    .orderBy(desc(questions.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Populates filter dropdowns from values that actually exist — subject/category are free
 * text (the platform supports any subject), so there's no fixed list to hardcode. */
export async function getQuestionFilterFacets(requester: AuthUser): Promise<{
  subjects: string[];
  categories: string[];
}> {
  const conditions = [isNull(questions.deletedAt)];
  if (requester.role !== "admin") {
    conditions.push(eq(questions.createdBy, requester.id));
  }

  const rows = await db
    .selectDistinct({
      subject: questions.subject,
      category: questions.category,
    })
    .from(questions)
    .where(and(...conditions));

  const subjects = new Set<string>();
  const categories = new Set<string>();
  for (const row of rows) {
    subjects.add(row.subject);
    if (row.category) categories.add(row.category);
  }

  return {
    subjects: [...subjects].sort(),
    categories: [...categories].sort(),
  };
}
