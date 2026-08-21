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
import { getTeacherDashboard } from "@/backend/dashboard/dashboard.service";
import { recordViolation } from "@/backend/monitoring/monitoring.service";
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
describe("dashboard.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let studentCId: string;
  let individuallyAssignedStudentId: string;
  let classId: string;
  let quizId: string;
  let correctOptionId: string;
  let wrongOptionId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `dashboard-service-teacher-${suffix}@quizguard.test`,
        name: "Dashboard Service Teacher",
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
          email: `dashboard-service-${label}-${suffix}@quizguard.test`,
          name: `Dashboard ${label}`,
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
    individuallyAssignedStudentId = await makeStudent("student-individual");

    const [cls] = await db
      .insert(classes)
      .values({ name: `Dashboard Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db.insert(classStudents).values([
      { classId, studentId: studentAId },
      { classId, studentId: studentBId },
      { classId, studentId: studentCId },
    ]);

    const mcInput: QuestionInput = {
      type: "multiple_choice",
      subject: `Dashboard Subject ${suffix}`,
      text: "What is 7 + 7?",
      tags: [],
      points: 2,
      difficulty: "easy",
      options: [
        { text: "14", isCorrect: true },
        { text: "15", isCorrect: false },
      ],
    };
    const question = await createQuestion(mcInput, teacherId);
    correctOptionId = question.options.find((o) => o.isCorrect)!.id;
    wrongOptionId = question.options.find((o) => !o.isCorrect)!.id;

    const quiz = await createQuiz(
      {
        title: `Dashboard Quiz ${suffix}`,
        subject: mcInput.subject,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 1,
        randomizeQuestions: false,
        randomizeOptions: false,
        fullscreenRequired: false,
        monitorActivity: true,
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
    await createAssignment(
      quizId,
      { studentId: individuallyAssignedStudentId },
      teacherId,
    );

    // Student A: answers correctly, submits, and gets flagged 3 times (crosses the
    // "flagged" threshold — see FLAGGED_VIOLATION_THRESHOLD in dashboard.service.ts).
    const attemptA = await startAttempt(quizId, studentAId);
    const activeA = await requireActiveAttemptForAnswering(
      attemptA.id,
      studentAId,
    );
    await recordViolation(activeA, { type: "tab_switch" });
    await recordViolation(activeA, { type: "tab_switch" });
    await recordViolation(activeA, { type: "copy_paste" });
    await saveAnswer(activeA, {
      questionId: question.id,
      selectedOptionIds: [correctOptionId],
    });
    await submitAttempt(attemptA.id, studentAId);

    // Student B: answers incorrectly, submits, no violations.
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

  it("returns an all-zero dashboard for a teacher with no quizzes", async () => {
    const passwordHash = await hashPassword("irrelevant");
    const [emptyTeacher] = await db
      .insert(users)
      .values({
        email: `dashboard-service-empty-teacher-${suffix}@quizguard.test`,
        name: "Empty Teacher",
        role: "teacher",
        passwordHash,
      })
      .returning();
    await db.insert(teachers).values({ userId: emptyTeacher.id });

    const dashboard = await getTeacherDashboard(emptyTeacher.id);
    expect(dashboard).toEqual({
      totalQuizzes: 0,
      totalStudents: 0,
      completedAttempts: 0,
      inProgressAttempts: 0,
      flaggedAttempts: 0,
      averageScorePercent: null,
      passedCount: 0,
      failedCount: 0,
      performanceOverTime: [],
      recentSubmissions: [],
    });

    await db.delete(teachers).where(eq(teachers.userId, emptyTeacher.id));
    await db.delete(users).where(eq(users.id, emptyTeacher.id));
  });

  it("aggregates across every quiz a teacher owns", async () => {
    const dashboard = await getTeacherDashboard(teacherId);

    expect(dashboard.totalQuizzes).toBe(1);
    // 3 class roster students + 1 individually-assigned student, no overlap.
    expect(dashboard.totalStudents).toBe(4);
    expect(dashboard.completedAttempts).toBe(2);
    expect(dashboard.inProgressAttempts).toBe(1);
    expect(dashboard.flaggedAttempts).toBe(1);
    expect(dashboard.averageScorePercent).toBe(50);
    expect(dashboard.passedCount).toBe(1);
    expect(dashboard.failedCount).toBe(1);

    expect(dashboard.performanceOverTime.length).toBeGreaterThanOrEqual(1);
    const totalPlottedThisWeek = dashboard.performanceOverTime.reduce(
      (sum, p) => sum + p.averageScorePercent,
      0,
    );
    expect(totalPlottedThisWeek).toBeGreaterThan(0);

    expect(dashboard.recentSubmissions).toHaveLength(2);
    const flaggedSubmission = dashboard.recentSubmissions.find(
      (s) => s.studentName === "Dashboard student-a",
    );
    expect(flaggedSubmission?.flagged).toBe(true);
    expect(flaggedSubmission?.violationCount).toBe(3);
    expect(flaggedSubmission?.scorePercent).toBe(100);

    const normalSubmission = dashboard.recentSubmissions.find(
      (s) => s.studentName === "Dashboard student-b",
    );
    expect(normalSubmission?.flagged).toBe(false);
    expect(normalSubmission?.scorePercent).toBe(0);
  });
});
