import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCodeForAttempt, saveAnswer } from "@/backend/answers/answer.service";
import { createAssignment } from "@/backend/assignments/assignment.service";
import {
  getAttempt,
  requireActiveAttemptForAnswering,
  startAttempt,
  submitAttempt,
} from "@/backend/attempts/attempt.service";
import { hashPassword } from "@/backend/auth/password";
import type { AuthUser } from "@/backend/auth/session";
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

// Requires `docker compose up -d` (Postgres/Redis/Piston) and `pnpm piston:install` having been
// run at least once against that Piston instance.
describe("code_answer grading (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let requester: AuthUser;
  let studentId: string;
  let classId: string;
  let pythonQuestionId: string;
  let timeoutQuestionId: string;
  let htmlQuestionId: string;
  let quizId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `code-answer-teacher-${suffix}@quizguard.test`,
        name: "Code Answer Teacher",
        role: "teacher",
        passwordHash,
      })
      .returning();
    await db.insert(teachers).values({ userId: teacher.id });
    teacherId = teacher.id;
    requester = {
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
      role: "teacher",
    };
    userIds.push(teacher.id);

    const [student] = await db
      .insert(users)
      .values({
        email: `code-answer-student-${suffix}@quizguard.test`,
        name: "Code Answer Student",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: student.id });
    studentId = student.id;
    userIds.push(student.id);

    const [cls] = await db
      .insert(classes)
      .values({ name: `Code Answer Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db.insert(classStudents).values({ classId, studentId });

    const subject = `Code Answer Subject ${suffix}`;

    const pythonInput: QuestionInput = {
      type: "code_answer",
      subject,
      text: "Read two integers from stdin, print their sum.",
      tags: [],
      points: 10,
      difficulty: "easy",
      options: [],
      codeLanguage: "python",
      testCases: [
        {
          input: "3\n4\n",
          expectedOutput: "7",
          isSample: true,
        },
        {
          input: "10\n20\n",
          expectedOutput: "30",
          isSample: false,
        },
      ],
    };
    const pythonQuestion = await createQuestion(pythonInput, teacherId);
    pythonQuestionId = pythonQuestion.id;

    const timeoutInput: QuestionInput = {
      type: "code_answer",
      subject,
      text: "This question exists only to exercise a runaway submission.",
      tags: [],
      points: 5,
      difficulty: "easy",
      options: [],
      codeLanguage: "python",
      testCases: [{ input: "", expectedOutput: "never", isSample: true }],
    };
    const timeoutQuestion = await createQuestion(timeoutInput, teacherId);
    timeoutQuestionId = timeoutQuestion.id;

    const htmlInput: QuestionInput = {
      type: "code_answer",
      subject,
      text: "Write a paragraph that says hello.",
      tags: [],
      points: 4,
      difficulty: "easy",
      options: [],
      codeLanguage: "html",
      testCases: [],
    };
    const htmlQuestion = await createQuestion(htmlInput, teacherId);
    htmlQuestionId = htmlQuestion.id;

    const quiz = await createQuiz(
      {
        title: `Code Answer Quiz ${suffix}`,
        subject,
        durationMinutes: 30,
        passingScore: 50,
        maxAttempts: 10,
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
    // Publishing requires at least one pooled question — attemptOn() re-sets the pool to
    // exactly the relevant question before each individual test's own attempt.
    await setQuizQuestionPool(quizId, [pythonQuestionId], requester);
    await publishQuiz(quizId, requester);
    await createAssignment(quizId, { classId }, teacherId);
  }, 30_000);

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

  async function attemptOn(questionId: string) {
    await setQuizQuestionPool(quizId, [questionId], requester);
    await publishQuiz(quizId, requester);
    return startAttempt(quizId, studentId);
  }

  it(
    "awards full credit when every test case passes",
    async () => {
      const attempt = await attemptOn(pythonQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );
      await saveAnswer(active, {
        questionId: pythonQuestionId,
        textAnswer: "a = int(input())\nb = int(input())\nprint(a + b)",
      });

      const submitted = await submitAttempt(attempt.id, studentId);
      expect(submitted.score).toBe(10);
      expect(submitted.passed).toBe(true);

      const view = await getAttempt(attempt.id, studentId);
      const answer = view.questions[0]?.answer;
      expect(answer?.isCorrect).toBe(true);
      expect(answer?.needsReview).toBe(false);
      expect(answer?.testResults).toHaveLength(2);
      expect(answer?.testResults?.every((r) => r.passed)).toBe(true);
    },
    30_000,
  );

  it(
    "awards proportional credit when only some test cases pass",
    async () => {
      const attempt = await attemptOn(pythonQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );
      // Passes the sample case (3+4=7) but is hardcoded, so fails the hidden one (10+20=30).
      await saveAnswer(active, {
        questionId: pythonQuestionId,
        textAnswer: "input(); input(); print(7)",
      });

      const submitted = await submitAttempt(attempt.id, studentId);
      // 1 of 2 test cases passed -> 10 * 0.5 = 5.
      expect(submitted.score).toBe(5);

      const view = await getAttempt(attempt.id, studentId);
      const answer = view.questions[0]?.answer;
      expect(answer?.isCorrect).toBe(false);
      expect(answer?.testResults?.filter((r) => r.passed)).toHaveLength(1);
    },
    30_000,
  );

  it(
    "grades a runtime error cleanly as 0, never crashing the submission",
    async () => {
      const attempt = await attemptOn(pythonQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );
      await saveAnswer(active, {
        questionId: pythonQuestionId,
        textAnswer: "raise Exception('boom')",
      });

      const submitted = await submitAttempt(attempt.id, studentId);
      expect(submitted.score).toBe(0);

      const view = await getAttempt(attempt.id, studentId);
      const answer = view.questions[0]?.answer;
      expect(answer?.isCorrect).toBe(false);
      expect(answer?.testResults?.every((r) => !r.passed)).toBe(true);
    },
    30_000,
  );

  it(
    "truncates a runaway submission instead of hanging the whole attempt",
    async () => {
      const attempt = await attemptOn(timeoutQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );
      await saveAnswer(active, {
        questionId: timeoutQuestionId,
        textAnswer: "while True:\n    pass",
      });

      const submitted = await submitAttempt(attempt.id, studentId);
      expect(submitted.score).toBe(0);
      expect(submitted.status).toBe("submitted");
    },
    30_000,
  );

  it(
    "never executes html/css — always lands as pending manual review with 0 provisional points",
    async () => {
      const attempt = await attemptOn(htmlQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );
      await saveAnswer(active, {
        questionId: htmlQuestionId,
        textAnswer: "<p>hello</p>",
      });

      const submitted = await submitAttempt(attempt.id, studentId);
      expect(submitted.score).toBe(0);

      const view = await getAttempt(attempt.id, studentId);
      const answer = view.questions[0]?.answer;
      expect(answer?.needsReview).toBe(true);
      expect(answer?.pointsAwarded).toBe(0);
      expect(answer?.testResults).toBeNull();
      expect(view.hasPendingReview).toBe(true);
    },
    30_000,
  );

  it(
    "the run endpoint only ever runs sample test cases, never leaking the hidden one",
    async () => {
      const attempt = await attemptOn(pythonQuestionId);
      const active = await requireActiveAttemptForAnswering(
        attempt.id,
        studentId,
      );

      const result = await runCodeForAttempt(
        active,
        pythonQuestionId,
        "a = int(input())\nb = int(input())\nprint(a + b)",
      );
      expect(result.ok).toBe(true);
      // Only 1 sample test case exists on this question (the "3\n4\n" -> "7" one) — the hidden
      // "10\n20\n" -> "30" case must never be run or referenced here.
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.passed).toBe(true);
    },
    30_000,
  );
});
