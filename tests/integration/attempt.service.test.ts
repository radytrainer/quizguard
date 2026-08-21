import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveAnswer } from "@/backend/answers/answer.service";
import { createAssignment } from "@/backend/assignments/assignment.service";
import {
  getAttempt,
  requireActiveAttemptForAnswering,
  startAttempt,
  submitAttempt,
} from "@/backend/attempts/attempt.service";
import { hashPassword } from "@/backend/auth/password";
import {
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
describe("attempt.service + answer.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let studentId: string;
  let outsiderStudentId: string;
  let classId: string;
  let mcQuestionId: string;
  let mcCorrectOptionId: string;
  let mcWrongOptionId: string;
  let saQuestionId: string;
  let quizId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `attempt-service-teacher-${suffix}@quizguard.test`,
        name: "Attempt Service Teacher",
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
        email: `attempt-service-student-${suffix}@quizguard.test`,
        name: "Attempt Service Student",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: student.id });
    studentId = student.id;
    userIds.push(student.id);

    const [outsider] = await db
      .insert(users)
      .values({
        email: `attempt-service-outsider-${suffix}@quizguard.test`,
        name: "Attempt Service Outsider",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: outsider.id });
    outsiderStudentId = outsider.id;
    userIds.push(outsider.id);

    const [cls] = await db
      .insert(classes)
      .values({ name: `Attempt Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db.insert(classStudents).values({ classId, studentId });

    const mcInput: QuestionInput = {
      type: "multiple_choice",
      subject: `Attempt Subject ${suffix}`,
      text: "What is 2 + 2?",
      tags: [],
      points: 2,
      difficulty: "easy",
      options: [
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
    };
    const mcQuestion = await createQuestion(mcInput, teacherId);
    mcQuestionId = mcQuestion.id;
    mcCorrectOptionId = mcQuestion.options.find((o) => o.isCorrect)!.id;
    mcWrongOptionId = mcQuestion.options.find((o) => !o.isCorrect)!.id;

    const saInput: QuestionInput = {
      type: "short_answer",
      subject: mcInput.subject,
      text: "Capital of France?",
      tags: [],
      points: 3,
      difficulty: "easy",
      options: [{ text: "Paris" }],
    };
    const saQuestion = await createQuestion(saInput, teacherId);
    saQuestionId = saQuestion.id;

    const quiz = await createQuiz(
      {
        title: `Attempt Quiz ${suffix}`,
        subject: mcInput.subject,
        durationMinutes: 30,
        passingScore: 50,
        // Generous on purpose: most tests below resume the same in-progress attempt, but a
        // couple submit and then start again, and maxAttempts-exhaustion is checked separately
        // with its own dedicated quiz (see the last test) so it isn't sensitive to exactly how
        // many real attempts the tests above happen to consume.
        maxAttempts: 10,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired: false,
        monitorActivity: false,
        autoSave: true,
        autoSubmit: true,
        showResults: true,
        questionsPerAttempt: 2,
      },
      teacherId,
    );
    quizId = quiz.id;
    await setQuizQuestionPool(quizId, [mcQuestionId, saQuestionId]);
    await publishQuiz(quizId);
    await createAssignment(quizId, { classId }, teacherId);
  });

  afterAll(async () => {
    // exam_attempt_questions and exam_answers cascade-delete from exam_attempts.id, so deleting
    // the attempts is enough — and it must happen before quizzes, since exam_attempts.quiz_id is
    // ON DELETE RESTRICT (Section 7's reasoning: attempt history shouldn't vanish silently).
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

  it("refuses to start an attempt for a student the quiz isn't assigned to", async () => {
    await expect(startAttempt(quizId, outsiderStudentId)).rejects.toMatchObject(
      { status: 403 },
    );
  });

  it("starts an attempt sampling the full pool and hides correctness", async () => {
    const attempt = await startAttempt(quizId, studentId);
    expect(attempt.status).toBe("in_progress");
    expect(attempt.attemptNumber).toBe(1);

    const view = await getAttempt(attempt.id, studentId);
    expect(view.questions).toHaveLength(2);
    expect(view.reviewAvailable).toBe(false);
    for (const q of view.questions) {
      for (const option of q.options) {
        expect(option.isCorrect).toBeUndefined();
      }
    }
  });

  it("resuming returns the same in-progress attempt", async () => {
    const first = await startAttempt(quizId, studentId);
    const second = await startAttempt(quizId, studentId);
    expect(second.id).toBe(first.id);
  });

  it("rejects saving an answer for a question outside the attempt's snapshot", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await expect(
      saveAnswer(active, { questionId: randomUUID(), selectedOptionIds: [] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a shape mismatch between answer and question type", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await expect(
      saveAnswer(active, { questionId: mcQuestionId, textAnswer: "4" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("grades a fully correct attempt as passed with full score", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await saveAnswer(active, {
      questionId: mcQuestionId,
      selectedOptionIds: [mcCorrectOptionId],
    });
    await saveAnswer(active, {
      questionId: saQuestionId,
      textAnswer: "  Paris  ",
    });

    const submitted = await submitAttempt(attempt.id, studentId);
    expect(submitted.status).toBe("submitted");
    expect(submitted.score).toBe(5);
    expect(submitted.maxScore).toBe(5);
    expect(submitted.passed).toBe(true);

    const view = await getAttempt(attempt.id, studentId);
    expect(view.reviewAvailable).toBe(true);
    const mcView = view.questions.find((q) => q.questionId === mcQuestionId)!;
    const correctOption = mcView.options.find(
      (o) => o.id === mcCorrectOptionId,
    )!;
    expect(correctOption.isCorrect).toBe(true);
  });

  it("submitting again is idempotent and doesn't re-grade", async () => {
    const attempt = await startAttempt(quizId, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    await saveAnswer(active, {
      questionId: mcQuestionId,
      selectedOptionIds: [mcWrongOptionId],
    });

    const first = await submitAttempt(attempt.id, studentId);
    const second = await submitAttempt(attempt.id, studentId);
    expect(second.score).toBe(first.score);
    expect(second.submittedAt?.getTime()).toBe(first.submittedAt?.getTime());
  });

  it("refuses a new attempt once maxAttempts is exhausted", async () => {
    // Its own quiz with maxAttempts: 1, so this doesn't depend on how many real attempts the
    // tests above happened to consume on the shared quiz.
    const oneShotQuiz = await createQuiz(
      {
        title: `One Shot Quiz ${suffix}`,
        subject: `Attempt Subject ${suffix}`,
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
    await setQuizQuestionPool(oneShotQuiz.id, [mcQuestionId]);
    await publishQuiz(oneShotQuiz.id);
    await createAssignment(oneShotQuiz.id, { classId }, teacherId);

    const attempt = await startAttempt(oneShotQuiz.id, studentId);
    await submitAttempt(attempt.id, studentId);

    await expect(startAttempt(oneShotQuiz.id, studentId)).rejects.toMatchObject(
      {
        status: 409,
      },
    );
  });

  it("auto-submits and grades an attempt once its deadline has passed", async () => {
    // A short-lived quiz+assignment just for this test, so exhausting maxAttempts above
    // doesn't interfere.
    const shortQuiz = await createQuiz(
      {
        title: `Expiry Quiz ${suffix}`,
        subject: `Attempt Subject ${suffix}`,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 3,
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
    await setQuizQuestionPool(shortQuiz.id, [mcQuestionId]);
    await publishQuiz(shortQuiz.id);
    await createAssignment(shortQuiz.id, { classId }, teacherId);

    const attempt = await startAttempt(shortQuiz.id, studentId);
    await db
      .update(examAttempts)
      .set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(eq(examAttempts.id, attempt.id));

    // getAttempt is a read: it must never mutate, even for a past-deadline attempt (Section 18
    // — a GET with a side effect would be a CSRF hole, since SameSite=Lax doesn't protect GET
    // the way it protects POST/PUT). It should report the DB state exactly as stored.
    const view = await getAttempt(attempt.id, studentId);
    expect(view.status).toBe("in_progress");
    expect(view.score).toBeNull();

    // The actual finalization happens through a mutating call — either the client's own
    // auto-submit POST once its countdown notices, or (as here) an explicit submit.
    const submitted = await submitAttempt(attempt.id, studentId);
    expect(submitted.status).toBe("auto_submitted");
    expect(submitted.score).toBe(0);
    expect(submitted.maxScore).toBe(2);

    const viewAfter = await getAttempt(attempt.id, studentId);
    expect(viewAfter.status).toBe("auto_submitted");
    expect(viewAfter.score).toBe(0);
  });

  it("locks on a fullscreen exit for a fullscreen-required quiz, blocking answers and submission until a teacher unlocks it", async () => {
    // Its own fullscreen-required quiz — the shared quiz above deliberately has
    // fullscreenRequired: false so it isn't affected by locking.
    const lockQuiz = await createQuiz(
      {
        title: `Lockdown Quiz ${suffix}`,
        subject: `Attempt Subject ${suffix}`,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 3,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired: true,
        monitorActivity: true,
        autoSave: true,
        autoSubmit: true,
        showResults: true,
        questionsPerAttempt: 1,
      },
      teacherId,
    );
    await setQuizQuestionPool(lockQuiz.id, [mcQuestionId]);
    await publishQuiz(lockQuiz.id);
    await createAssignment(lockQuiz.id, { classId }, teacherId);

    const attempt = await startAttempt(lockQuiz.id, studentId);
    const active = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    const locked = await recordViolation(active, { type: "fullscreen_exit" });
    expect(locked).toBe(true);

    // The real API route (POST /api/attempts/:id/answers) always re-fetches through
    // requireActiveAttemptForAnswering immediately before calling saveAnswer, so proving that
    // gate rejects is exactly what proves answer-saving is blocked while locked.
    await expect(
      requireActiveAttemptForAnswering(attempt.id, studentId),
    ).rejects.toMatchObject({ status: 409 });
    await expect(submitAttempt(attempt.id, studentId)).rejects.toMatchObject({
      status: 409,
    });

    await unlockAttempt(lockQuiz.id, attempt.id);

    const reactivated = await requireActiveAttemptForAnswering(
      attempt.id,
      studentId,
    );
    expect(reactivated.locked).toBe(false);
    const submitted = await submitAttempt(attempt.id, studentId);
    expect(submitted.status).toBe("submitted");
  });
});
