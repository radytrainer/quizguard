import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignment } from "@/backend/assignments/assignment.service";
import { db, pool } from "@/lib/db";
import {
  classStudents,
  classes,
  questions,
  quizzes,
  students,
  teachers,
  users,
} from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import type { QuestionInput } from "@/backend/questions/question.schema";
import { createQuestion } from "@/backend/questions/question.service";
import type { QuizInput } from "@/backend/quizzes/quiz.schema";
import {
  archiveQuiz,
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getQuiz,
  getQuizQuestionPool,
  listQuizzes,
  publishQuiz,
  setQuizQuestionPool,
  unpublishQuiz,
  updateQuiz,
} from "@/backend/quizzes/quiz.service";

// Requires `docker compose up -d` (PostgreSQL).
describe("quiz.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const authorEmail = `quiz-service-author-${suffix}@quizguard.test`;
  let authorId: string;
  let questionIds: string[];
  let classId: string;
  const studentUserIds: string[] = [];

  const baseQuiz: QuizInput = {
    title: `Integration Quiz ${suffix}`,
    subject: `Integration Subject ${suffix}`,
    durationMinutes: 30,
    passingScore: 70,
    maxAttempts: 1,
    randomizeQuestions: false,
    randomizeOptions: false,
    fullscreenRequired: false,
    monitorActivity: false,
    autoSave: true,
    autoSubmit: true,
    showResults: true,
    questionsPerAttempt: 2,
  };

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");
    const [author] = await db
      .insert(users)
      .values({
        email: authorEmail,
        name: "Quiz Test Author",
        role: "teacher",
        passwordHash,
      })
      .returning();
    authorId = author.id;
    await db.insert(teachers).values({ userId: authorId });

    const [cls] = await db
      .insert(classes)
      .values({ name: `Quiz Test Class ${suffix}`, teacherId: authorId })
      .returning();
    classId = cls.id;

    for (let i = 0; i < 2; i++) {
      const [studentUser] = await db
        .insert(users)
        .values({
          email: `quiz-service-student-${i}-${suffix}@quizguard.test`,
          name: `Quiz Test Student ${i}`,
          role: "student",
          passwordHash,
        })
        .returning();
      studentUserIds.push(studentUser.id);
      await db.insert(students).values({ userId: studentUser.id });
      await db
        .insert(classStudents)
        .values({ classId, studentId: studentUser.id });
    }

    const questionInput: QuestionInput = {
      type: "short_answer",
      subject: baseQuiz.subject,
      text: "Placeholder question",
      tags: [],
      points: 1,
      difficulty: "easy",
      options: [{ text: "42" }],
    };

    const created = await Promise.all([
      createQuestion(questionInput, authorId),
      createQuestion(questionInput, authorId),
      createQuestion(questionInput, authorId),
    ]);
    questionIds = created.map((q) => q.id);
  });

  afterAll(async () => {
    // Deleting quizzes cascades to their quiz_questions/quiz_assignments rows first, which is
    // required before questions can be deleted (quiz_questions.question_id is ON DELETE
    // RESTRICT) and before classes can be deleted (classes.teacher_id is also RESTRICT, so the
    // teacher row itself has to go last).
    await db.delete(quizzes).where(eq(quizzes.createdBy, authorId));
    await db.delete(questions).where(eq(questions.createdBy, authorId));
    await db.delete(classes).where(eq(classes.id, classId));
    await db.delete(teachers).where(eq(teachers.userId, authorId));
    await db.delete(users).where(eq(users.id, authorId));
    for (const id of studentUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it("creates a quiz with default status draft", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    expect(quiz.status).toBe("draft");
    expect(quiz.title).toBe(baseQuiz.title);
  });

  it("reports questionCount via getQuiz", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    const fetched = await getQuiz(quiz.id);
    expect(fetched.questionCount).toBe(0);

    await setQuizQuestionPool(quiz.id, questionIds);
    const afterPool = await getQuiz(quiz.id);
    expect(afterPool.questionCount).toBe(3);
  });

  it("updates quiz settings", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    const updated = await updateQuiz(quiz.id, {
      ...baseQuiz,
      title: "Updated title",
      passingScore: 80,
    });
    expect(updated.title).toBe("Updated title");
    expect(updated.passingScore).toBe(80);
  });

  it("refuses to publish a quiz with an empty pool", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await expect(publishQuiz(quiz.id)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to publish when the pool is smaller than questionsPerAttempt", async () => {
    const quiz = await createQuiz(
      { ...baseQuiz, questionsPerAttempt: 5 },
      authorId,
    );
    await setQuizQuestionPool(quiz.id, [questionIds[0]]);
    await expect(publishQuiz(quiz.id)).rejects.toMatchObject({ status: 409 });
  });

  it("publishes, unpublishes, and archives a quiz", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(quiz.id, questionIds);

    const published = await publishQuiz(quiz.id);
    expect(published.status).toBe("published");

    const unpublished = await unpublishQuiz(quiz.id);
    expect(unpublished.status).toBe("draft");

    const archived = await archiveQuiz(quiz.id);
    expect(archived.status).toBe("archived");
  });

  it("replaces the question pool rather than merging", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(quiz.id, questionIds);
    await setQuizQuestionPool(quiz.id, [questionIds[0]]);

    const pool = await getQuizQuestionPool(quiz.id);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe(questionIds[0]);
  });

  it("duplicates a quiz with its settings and pool, resetting status to draft", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(quiz.id, questionIds);
    await publishQuiz(quiz.id);

    const copy = await duplicateQuiz(quiz.id, authorId);
    expect(copy.id).not.toBe(quiz.id);
    expect(copy.title).toBe(`${baseQuiz.title} (Copy)`);
    expect(copy.status).toBe("draft");

    const copyPool = await getQuizQuestionPool(copy.id);
    expect(copyPool).toHaveLength(3);
  });

  it("soft-deletes: getQuiz 404s afterward", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await deleteQuiz(quiz.id);

    await expect(getQuiz(quiz.id)).rejects.toMatchObject({ status: 404 });
  });

  it("filters listQuizzes by subject and status, and reports questionCount", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(quiz.id, questionIds);
    await publishQuiz(quiz.id);

    const bySubject = await listQuizzes({
      subject: baseQuiz.subject,
      page: 1,
      pageSize: 50,
    });
    expect(bySubject.total).toBeGreaterThanOrEqual(1);
    const found = bySubject.items.find((q) => q.id === quiz.id);
    expect(found?.questionCount).toBe(3);

    const byStatus = await listQuizzes({
      subject: baseQuiz.subject,
      status: "published",
      page: 1,
      pageSize: 50,
    });
    expect(byStatus.items.every((q) => q.status === "published")).toBe(true);
  });

  it("reports studentCount from the assigned class's roster", async () => {
    const quiz = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(quiz.id, questionIds);
    await publishQuiz(quiz.id);
    await createAssignment(quiz.id, { classId }, authorId);

    const result = await listQuizzes({
      subject: baseQuiz.subject,
      page: 1,
      pageSize: 50,
    });
    const found = result.items.find((q) => q.id === quiz.id);
    expect(found?.studentCount).toBe(2);
  });

  it("filters by classId to only quizzes assigned to that class", async () => {
    const assigned = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(assigned.id, questionIds);
    await publishQuiz(assigned.id);
    await createAssignment(assigned.id, { classId }, authorId);

    const unassigned = await createQuiz(baseQuiz, authorId);
    await setQuizQuestionPool(unassigned.id, questionIds);
    await publishQuiz(unassigned.id);

    const result = await listQuizzes({
      subject: baseQuiz.subject,
      classId,
      page: 1,
      pageSize: 50,
    });
    const ids = result.items.map((q) => q.id);
    expect(ids).toContain(assigned.id);
    expect(ids).not.toContain(unassigned.id);
  });

  it("derives a 'scheduled' displayStatus for a published quiz with a future startAt", async () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const quiz = await createQuiz(
      { ...baseQuiz, startAt: futureStart },
      authorId,
    );
    await setQuizQuestionPool(quiz.id, questionIds);
    await publishQuiz(quiz.id);

    const all = await listQuizzes({
      subject: baseQuiz.subject,
      page: 1,
      pageSize: 50,
    });
    const found = all.items.find((q) => q.id === quiz.id);
    expect(found?.status).toBe("published");
    expect(found?.displayStatus).toBe("scheduled");

    // The underlying stored status still matches a plain "published" filter — "scheduled" is
    // a narrower view onto the same rows, not a separate status a quiz actually has.
    const byPublished = await listQuizzes({
      subject: baseQuiz.subject,
      status: "published",
      page: 1,
      pageSize: 50,
    });
    expect(byPublished.items.map((q) => q.id)).toContain(quiz.id);

    const byScheduled = await listQuizzes({
      subject: baseQuiz.subject,
      status: "scheduled",
      page: 1,
      pageSize: 50,
    });
    expect(byScheduled.items.map((q) => q.id)).toContain(quiz.id);
  });

  it("filters by the calendar day of startAt", async () => {
    const targetDay = new Date("2030-06-15T09:00:00Z");
    const quiz = await createQuiz(
      { ...baseQuiz, startAt: targetDay },
      authorId,
    );
    await setQuizQuestionPool(quiz.id, questionIds);

    const sameDay = await listQuizzes({
      subject: baseQuiz.subject,
      date: new Date("2030-06-15T00:00:00Z"),
      page: 1,
      pageSize: 50,
    });
    expect(sameDay.items.map((q) => q.id)).toContain(quiz.id);

    const differentDay = await listQuizzes({
      subject: baseQuiz.subject,
      date: new Date("2030-06-16T00:00:00Z"),
      page: 1,
      pageSize: 50,
    });
    expect(differentDay.items.map((q) => q.id)).not.toContain(quiz.id);
  });
});
