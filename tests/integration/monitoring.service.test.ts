import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignment } from "@/backend/assignments/assignment.service";
import {
  requireActiveAttemptForAnswering,
  startAttempt,
  submitAttempt,
} from "@/backend/attempts/attempt.service";
import { hashPassword } from "@/backend/auth/password";
import {
  getActivityHistory,
  getAttemptDetailForTeacher,
  listAttemptsForQuiz,
  recordViolation,
  unlockAttempt,
} from "@/backend/monitoring/monitoring.service";
import type { QuestionInput } from "@/backend/questions/question.schema";
import { createQuestion } from "@/backend/questions/question.service";
import {
  createQuiz,
  publishQuiz,
  setQuizQuestionPool,
} from "@/backend/quizzes/quiz.service";
import { db, pool } from "@/lib/db";
import {
  classStudents,
  classes,
  examAttempts,
  questions,
  quizAssignments,
  quizzes,
  students,
  teachers,
  users,
} from "@/database/schema";

// Requires `docker compose up -d` (PostgreSQL).
describe("monitoring.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let studentId: string;
  let classId: string;
  let mcQuestionId: string;
  let mcCorrectOptionId: string;
  let quizId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `monitoring-service-teacher-${suffix}@quizguard.test`,
        name: "Monitoring Service Teacher",
        role: "teacher",
        passwordHash,
      })
      .returning();
    await db.insert(teachers).values({ userId: teacher.id });
    teacherId = teacher.id;
    userIds.push(teacher.id);

    const [student] = await db
      .insert(users)
      .values({
        email: `monitoring-service-student-${suffix}@quizguard.test`,
        name: "Monitoring Service Student",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: student.id });
    studentId = student.id;
    userIds.push(student.id);

    const [cls] = await db
      .insert(classes)
      .values({ name: `Monitoring Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db.insert(classStudents).values({ classId, studentId });

    const mcInput: QuestionInput = {
      type: "multiple_choice",
      subject: `Monitoring Subject ${suffix}`,
      text: "What is 3 + 3?",
      tags: [],
      points: 4,
      difficulty: "easy",
      options: [
        { text: "6", isCorrect: true },
        { text: "7", isCorrect: false },
      ],
    };
    const mcQuestion = await createQuestion(mcInput, teacherId);
    mcQuestionId = mcQuestion.id;
    mcCorrectOptionId = mcQuestion.options.find((o) => o.isCorrect)!.id;

    const quiz = await createQuiz(
      {
        title: `Monitoring Quiz ${suffix}`,
        subject: mcInput.subject,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 3,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired: true,
        monitorActivity: true,
        autoSave: true,
        autoSubmit: true,
        // showResults is deliberately false: the teacher view must still show correctness even
        // though the student's own view wouldn't.
        showResults: false,
        questionsPerAttempt: 1,
      },
      teacherId,
    );
    quizId = quiz.id;
    await setQuizQuestionPool(quizId, [mcQuestionId]);
    await publishQuiz(quizId);
    await createAssignment(quizId, { classId }, teacherId);
  });

  afterAll(async () => {
    await db.delete(examAttempts).where(eq(examAttempts.studentId, studentId));
    await db
      .delete(quizAssignments)
      .where(eq(quizAssignments.assignedBy, teacherId));
    await db.delete(quizzes).where(eq(quizzes.createdBy, teacherId));
    await db.delete(questions).where(eq(questions.createdBy, teacherId));
    await db.delete(classes).where(eq(classes.teacherId, teacherId));
    await db.delete(teachers).where(inArray(teachers.userId, userIds));
    await db.delete(students).where(inArray(students.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("lists attempts for a quiz with a zero violation count before any are recorded", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const list = await listAttemptsForQuiz(quizId);
    const found = list.find((a) => a.id === attempt.id);
    expect(found).toBeDefined();
    expect(found?.studentName).toBe("Monitoring Service Student");
    expect(found?.violationCount).toBe(0);
  });

  it("records violations and reflects them in the list and detail views", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );

    await recordViolation(active, { type: "fullscreen_exit" });
    await recordViolation(active, { type: "tab_switch" });
    await recordViolation(active, { type: "tab_switch" });

    const list = await listAttemptsForQuiz(quizId);
    const found = list.find((a) => a.id === attempt.id);
    expect(found?.violationCount).toBe(3);

    const detail = await getAttemptDetailForTeacher(quizId, attempt.id);
    expect(detail.violations).toHaveLength(3);
    expect(detail.violations.map((v) => v.type).sort()).toEqual(
      ["fullscreen_exit", "tab_switch", "tab_switch"].sort(),
    );
  });

  it("shows correctness in the teacher detail view even though the quiz hides it from students", async () => {
    const attempt = await startAttempt(quizId, studentId);

    const detail = await getAttemptDetailForTeacher(quizId, attempt.id);
    expect(detail.questions).toHaveLength(1);
    const option = detail.questions[0].options.find(
      (o) => o.id === mcCorrectOptionId,
    );
    expect(option?.isCorrect).toBe(true);
  });

  it("404s the detail view for an attempt that belongs to a different quiz", async () => {
    const otherQuiz = await createQuiz(
      {
        title: `Other Quiz ${suffix}`,
        subject: `Monitoring Subject ${suffix}`,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 1,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired: false,
        monitorActivity: false,
        autoSave: true,
        autoSubmit: true,
        showResults: true,
        questionsPerAttempt: 1,
      },
      teacherId,
    );

    const attempt = await startAttempt(quizId, studentId);
    await expect(
      getAttemptDetailForTeacher(otherQuiz.id, attempt.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s listing attempts for a nonexistent quiz", async () => {
    await expect(listAttemptsForQuiz(randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });

  // A dedicated quiz per lock/unlock test below, each with its own fresh attempt — the shared
  // `quizId` fixture's in-progress attempt gets *resumed*, not recreated, by every `startAttempt`
  // call against it (Section 7), so reusing it here would let one test's lock leak into the
  // next. `maxAttempts: 1` is enough since each test only ever needs one attempt.
  async function createLockTestQuiz(
    title: string,
    fullscreenRequired: boolean,
  ) {
    const quiz = await createQuiz(
      {
        title: `${title} ${suffix}`,
        subject: `Monitoring Subject ${suffix}`,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 1,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired,
        monitorActivity: true,
        autoSave: true,
        autoSubmit: true,
        showResults: true,
        questionsPerAttempt: 1,
      },
      teacherId,
    );
    await setQuizQuestionPool(quiz.id, [mcQuestionId]);
    await publishQuiz(quiz.id);
    await createAssignment(quiz.id, { classId }, teacherId);
    return quiz.id;
  }

  it("locks on a fullscreen exit for a fullscreen-required quiz and reflects it in list/detail views", async () => {
    const lockQuizId = await createLockTestQuiz("Lock Test Quiz", true);
    const attempt = await startAttempt(lockQuizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    const locked = await recordViolation(active, { type: "fullscreen_exit" });
    expect(locked).toBe(true);

    const list = await listAttemptsForQuiz(lockQuizId);
    expect(list.find((a) => a.id === attempt.id)?.locked).toBe(true);
    const detail = await getAttemptDetailForTeacher(lockQuizId, attempt.id);
    expect(detail.locked).toBe(true);
  });

  it("does not lock for tab_switch or copy_paste, even on a fullscreen-required quiz", async () => {
    const lockQuizId = await createLockTestQuiz(
      "Non-Lock Violation Quiz",
      true,
    );
    const attempt = await startAttempt(lockQuizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    expect(await recordViolation(active, { type: "tab_switch" })).toBe(false);
    expect(await recordViolation(active, { type: "copy_paste" })).toBe(false);

    const detail = await getAttemptDetailForTeacher(lockQuizId, attempt.id);
    expect(detail.locked).toBe(false);
  });

  it("does not lock a fullscreen exit on a quiz that doesn't require fullscreen", async () => {
    const openQuizId = await createLockTestQuiz("No Fullscreen Quiz", false);
    const attempt = await startAttempt(openQuizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    expect(await recordViolation(active, { type: "fullscreen_exit" })).toBe(
      false,
    );
  });

  it("unlocks a locked attempt, and is a no-op when it's already unlocked", async () => {
    const lockQuizId = await createLockTestQuiz("Unlock Test Quiz", true);
    const attempt = await startAttempt(lockQuizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await recordViolation(active, { type: "fullscreen_exit" });
    expect(
      (await getAttemptDetailForTeacher(lockQuizId, attempt.id)).locked,
    ).toBe(true);

    await unlockAttempt(lockQuizId, attempt.id);
    expect(
      (await getAttemptDetailForTeacher(lockQuizId, attempt.id)).locked,
    ).toBe(false);

    // Already unlocked — must not throw.
    await expect(
      unlockAttempt(lockQuizId, attempt.id),
    ).resolves.toBeUndefined();
  });

  it("404s unlocking an attempt under the wrong quiz id", async () => {
    const lockQuizId = await createLockTestQuiz("Wrong Quiz Unlock Test", true);
    const attempt = await startAttempt(lockQuizId, studentId);
    await expect(unlockAttempt(randomUUID(), attempt.id)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("reconstructs the full activity history from durable storage, including a lock/unlock round trip", async () => {
    const historyQuizId = await createLockTestQuiz(
      "Activity History Quiz",
      true,
    );
    const attempt = await startAttempt(historyQuizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await recordViolation(active, { type: "fullscreen_exit" });
    await unlockAttempt(historyQuizId, attempt.id);
    await submitAttempt(attempt.id, studentId);

    const history = await getActivityHistory(historyQuizId);
    const forThisAttempt = history.filter((e) => e.attemptId === attempt.id);
    expect(forThisAttempt.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        "attempt_started",
        "violation",
        "attempt_locked",
        "attempt_unlocked",
        "attempt_submitted",
      ]),
    );
    expect(
      forThisAttempt.every(
        (e) => e.studentName === "Monitoring Service Student",
      ),
    ).toBe(true);

    // Newest-first, merged correctly across all three source tables: the submission (last
    // thing that happened) leads, the attempt start (first thing that happened) trails.
    expect(forThisAttempt[0].type).toBe("attempt_submitted");
    expect(forThisAttempt[forThisAttempt.length - 1].type).toBe(
      "attempt_started",
    );
  });

  it("404s getting activity history for a nonexistent quiz", async () => {
    await expect(getActivityHistory(randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });
});
