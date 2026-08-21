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
import { saveAnswer } from "@/backend/answers/answer.service";
import type { QuestionInput } from "@/backend/questions/question.schema";
import { createQuestion } from "@/backend/questions/question.service";
import {
  createQuiz,
  publishQuiz,
  setQuizQuestionPool,
} from "@/backend/quizzes/quiz.service";
import {
  getClassResults,
  getQuizResults,
} from "@/backend/results/results.service";
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
describe("results.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let studentCId: string;
  let classId: string;
  let quizId: string;
  let correctOptionId: string;
  let wrongOptionId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `results-service-teacher-${suffix}@quizguard.test`,
        name: "Results Service Teacher",
        role: "teacher",
        passwordHash,
      })
      .returning();
    await db.insert(teachers).values({ userId: teacher.id });
    teacherId = teacher.id;
    userIds.push(teacher.id);

    async function makeStudent(label: string) {
      const [student] = await db
        .insert(users)
        .values({
          email: `results-service-${label}-${suffix}@quizguard.test`,
          name: `Results ${label}`,
          role: "student",
          passwordHash,
        })
        .returning();
      await db.insert(students).values({ userId: student.id });
      userIds.push(student.id);
      return student.id;
    }
    studentAId = await makeStudent("student-a");
    studentBId = await makeStudent("student-b");
    studentCId = await makeStudent("student-c");

    const [cls] = await db
      .insert(classes)
      .values({ name: `Results Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db.insert(classStudents).values([
      { classId, studentId: studentAId },
      { classId, studentId: studentBId },
      { classId, studentId: studentCId },
    ]);

    const mcInput: QuestionInput = {
      type: "multiple_choice",
      subject: `Results Subject ${suffix}`,
      text: "What is 6 + 6?",
      tags: [],
      points: 2,
      difficulty: "easy",
      options: [
        { text: "12", isCorrect: true },
        { text: "13", isCorrect: false },
      ],
    };
    const question = await createQuestion(mcInput, teacherId);
    correctOptionId = question.options.find((o) => o.isCorrect)!.id;
    wrongOptionId = question.options.find((o) => !o.isCorrect)!.id;

    const quiz = await createQuiz(
      {
        title: `Results Quiz ${suffix}`,
        subject: mcInput.subject,
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
    quizId = quiz.id;
    await setQuizQuestionPool(quizId, [question.id]);
    await publishQuiz(quizId);
    await createAssignment(quizId, { classId }, teacherId);

    // Student A: answers correctly and submits (100%, passed).
    const attemptA = await startAttempt(quizId, studentAId);
    const activeA = await requireActiveAttemptForAnswering(
      attemptA.id,
      studentAId,
    );
    await saveAnswer(activeA, {
      questionId: question.id,
      selectedOptionIds: [correctOptionId],
    });
    await submitAttempt(attemptA.id, studentAId);

    // Student B: answers incorrectly and submits (0%, failed).
    const attemptB = await startAttempt(quizId, studentBId);
    const activeB = await requireActiveAttemptForAnswering(
      attemptB.id,
      studentBId,
    );
    await saveAnswer(activeB, {
      questionId: question.id,
      selectedOptionIds: [wrongOptionId],
    });
    await submitAttempt(attemptB.id, studentBId);

    // Student C: starts but never submits (still in_progress).
    await startAttempt(quizId, studentCId);
  });

  afterAll(async () => {
    await db
      .delete(examAttempts)
      .where(
        inArray(examAttempts.studentId, [studentAId, studentBId, studentCId]),
      );
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

  it("aggregates quiz-level results across finished and in-progress attempts", async () => {
    const summary = await getQuizResults(quizId);

    expect(summary.totalAttempts).toBe(3);
    expect(summary.finishedAttempts).toBe(2);
    expect(summary.inProgressAttempts).toBe(1);
    expect(summary.averageScorePercent).toBe(50);
    expect(summary.passedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.passRate).toBe(50);

    const highBucket = summary.scoreDistribution.find(
      (b) => b.label === "80–100%",
    );
    const lowBucket = summary.scoreDistribution.find(
      (b) => b.label === "0–19%",
    );
    expect(highBucket?.count).toBe(1);
    expect(lowBucket?.count).toBe(1);

    expect(summary.questionStats).toHaveLength(1);
    expect(summary.questionStats[0].timesAsked).toBe(2);
    expect(summary.questionStats[0].timesCorrect).toBe(1);
    expect(summary.questionStats[0].percentCorrect).toBe(50);
  });

  it("404s for a nonexistent quiz", async () => {
    await expect(getQuizResults(randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });

  it("computes per-quiz pass rates for a class roster", async () => {
    const results = await getClassResults(classId);
    expect(results).toHaveLength(1);
    expect(results[0].quizId).toBe(quizId);
    expect(results[0].rosterCount).toBe(3);
    expect(results[0].attemptedCount).toBe(2);
    expect(results[0].passedCount).toBe(1);
    expect(results[0].passRate).toBe(50);
  });

  it("returns an empty list for a class with no quiz assignments", async () => {
    const [emptyClass] = await db
      .insert(classes)
      .values({ name: `Empty Class ${suffix}`, teacherId })
      .returning();

    const results = await getClassResults(emptyClass.id);
    expect(results).toEqual([]);

    await db.delete(classes).where(eq(classes.id, emptyClass.id));
  });
});
