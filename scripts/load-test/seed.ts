/**
 * Generates a realistic bulk dataset for Phase 12 load testing — many students, a large-ish
 * question pool, and a batch of historical (already-graded) attempts so `results.service.ts`'s
 * aggregation queries (Section 13) have real volume to run `EXPLAIN ANALYZE` against, not an
 * empty table. Idempotent-ish: re-running adds more historical attempts on top rather than
 * erroring, but student accounts/questions/the quiz upsert cleanly.
 *
 * Talks to the database directly rather than through the backend/* service layer: those files
 * carry a `"server-only"` guard that throws unconditionally outside Next's bundler (see
 * backend/auth/session-lookup.ts's doc comment for the same reasoning) — this script runs under
 * plain tsx, same as src/realtime/server.ts.
 */
import { and, eq, isNull } from "drizzle-orm";

import { hashPassword } from "@/backend/auth/password";
import { db, pool } from "@/lib/db";
import {
  classStudents,
  classes,
  examAnswers,
  examAttemptQuestions,
  examAttempts,
  questionOptions,
  questions,
  quizAssignments,
  quizQuestions,
  quizzes,
  students,
  teachers,
  users,
  type User,
} from "@/database/schema";
import {
  LOAD_TEST_CLASS_NAME,
  LOAD_TEST_HISTORICAL_ATTEMPTS,
  LOAD_TEST_PASSWORD,
  LOAD_TEST_QUESTION_COUNT,
  LOAD_TEST_QUIZ_TITLE,
  LOAD_TEST_STUDENT_COUNT,
  LOAD_TEST_SUBJECT,
  LOAD_TEST_TEACHER_EMAIL,
  studentEmail,
} from "./config";

async function upsertUser(
  input: { email: string; name: string; role: "teacher" | "student" },
  passwordHash: string,
) {
  const [inserted] = await db
    .insert(users)
    .values({ ...input, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (inserted) return inserted;
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  return existing;
}

async function main() {
  const start = Date.now();
  const passwordHash = await hashPassword(LOAD_TEST_PASSWORD);

  const teacher = await upsertUser(
    {
      email: LOAD_TEST_TEACHER_EMAIL,
      name: "Load Test Teacher",
      role: "teacher",
    },
    passwordHash,
  );
  await db
    .insert(teachers)
    .values({ userId: teacher.id })
    .onConflictDoNothing();

  console.log(`Creating ${LOAD_TEST_STUDENT_COUNT} student accounts...`);
  const studentUsers: User[] = [];
  for (let i = 0; i < LOAD_TEST_STUDENT_COUNT; i++) {
    const student = await upsertUser(
      {
        email: studentEmail(i),
        name: `Load Test Student ${i}`,
        role: "student",
      },
      passwordHash,
    );
    studentUsers.push(student);
  }
  await db
    .insert(students)
    .values(studentUsers.map((s) => ({ userId: s.id })))
    .onConflictDoNothing();

  const [existingClass] = await db
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.teacherId, teacher.id),
        eq(classes.name, LOAD_TEST_CLASS_NAME),
        isNull(classes.deletedAt),
      ),
    )
    .limit(1);
  const cls =
    existingClass ??
    (
      await db
        .insert(classes)
        .values({ name: LOAD_TEST_CLASS_NAME, teacherId: teacher.id })
        .returning()
    )[0];
  await db
    .insert(classStudents)
    .values(studentUsers.map((s) => ({ classId: cls.id, studentId: s.id })))
    .onConflictDoNothing();

  const existingQuestions = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.subject, LOAD_TEST_SUBJECT),
        eq(questions.createdBy, teacher.id),
        isNull(questions.deletedAt),
      ),
    );

  let createdQuestions: {
    id: string;
    options: { id: string; isCorrect: boolean }[];
  }[];
  if (existingQuestions.length > 0) {
    createdQuestions = [];
    for (const q of existingQuestions) {
      const options = await db
        .select({
          id: questionOptions.id,
          isCorrect: questionOptions.isCorrect,
        })
        .from(questionOptions)
        .where(eq(questionOptions.questionId, q.id));
      createdQuestions.push({ id: q.id, options });
    }
  } else {
    console.log(`Creating ${LOAD_TEST_QUESTION_COUNT} questions...`);
    createdQuestions = [];
    for (let i = 0; i < LOAD_TEST_QUESTION_COUNT; i++) {
      const [question] = await db
        .insert(questions)
        .values({
          type: "multiple_choice",
          subject: LOAD_TEST_SUBJECT,
          difficulty: "medium",
          points: 1,
          text: `Load test question ${i + 1}: what is ${i + 1} + ${i + 1}?`,
          tags: [],
          createdBy: teacher.id,
        })
        .returning();
      const options = await db
        .insert(questionOptions)
        .values([
          {
            questionId: question.id,
            text: String((i + 1) * 2),
            isCorrect: true,
            position: 0,
          },
          {
            questionId: question.id,
            text: String((i + 1) * 2 + 1),
            isCorrect: false,
            position: 1,
          },
          {
            questionId: question.id,
            text: String((i + 1) * 2 + 2),
            isCorrect: false,
            position: 2,
          },
        ])
        .returning({
          id: questionOptions.id,
          isCorrect: questionOptions.isCorrect,
        });
      createdQuestions.push({ id: question.id, options });
    }
  }

  // quizzes.title has no unique constraint, so a bare insert would pile up duplicate
  // "Load Test Quiz" rows on rerun — look it up first.
  const [existingQuiz] = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.title, LOAD_TEST_QUIZ_TITLE),
        eq(quizzes.createdBy, teacher.id),
        isNull(quizzes.deletedAt),
      ),
    )
    .limit(1);
  const quiz =
    existingQuiz ??
    (
      await db
        .insert(quizzes)
        .values({
          title: LOAD_TEST_QUIZ_TITLE,
          subject: LOAD_TEST_SUBJECT,
          durationMinutes: 30,
          passingScore: 50,
          maxAttempts: 20,
          questionsPerAttempt: LOAD_TEST_QUESTION_COUNT,
          status: "published",
          createdBy: teacher.id,
        })
        .returning()
    )[0];

  await db.delete(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
  await db.insert(quizQuestions).values(
    createdQuestions.map((q, position) => ({
      quizId: quiz.id,
      questionId: q.id,
      position,
    })),
  );

  const [existingAssignment] = await db
    .select({ id: quizAssignments.id })
    .from(quizAssignments)
    .where(
      and(
        eq(quizAssignments.quizId, quiz.id),
        eq(quizAssignments.classId, cls.id),
      ),
    )
    .limit(1);
  if (!existingAssignment) {
    await db
      .insert(quizAssignments)
      .values({ quizId: quiz.id, classId: cls.id, assignedBy: teacher.id });
  }

  console.log(
    `Generating ${LOAD_TEST_HISTORICAL_ATTEMPTS} historical (already-graded) attempts...`,
  );
  const now = new Date();
  for (let batch = 0; batch < LOAD_TEST_HISTORICAL_ATTEMPTS; batch += 50) {
    const batchSize = Math.min(50, LOAD_TEST_HISTORICAL_ATTEMPTS - batch);
    await db.transaction(async (tx) => {
      for (let i = 0; i < batchSize; i++) {
        const student = studentUsers[(batch + i) % studentUsers.length];
        const startedAt = new Date(
          now.getTime() - Math.random() * 30 * 86_400_000,
        );
        const [attempt] = await tx
          .insert(examAttempts)
          .values({
            quizId: quiz.id,
            studentId: student.id,
            attemptNumber: 1 + Math.floor((batch + i) / studentUsers.length),
            status: "submitted",
            startedAt,
            deadlineAt: new Date(startedAt.getTime() + 30 * 60_000),
            submittedAt: new Date(startedAt.getTime() + 20 * 60_000),
          })
          .returning();

        let score = 0;
        const answerRows = [];
        const snapshotRows = [];
        for (const [position, question] of createdQuestions.entries()) {
          snapshotRows.push({
            attemptId: attempt.id,
            questionId: question.id,
            position,
            optionOrder: question.options.map((o) => o.id),
          });
          const isCorrect = Math.random() < 0.7; // ~70% correct, a plausible pass distribution
          const correctOption = question.options.find((o) => o.isCorrect);
          const wrongOption = question.options.find((o) => !o.isCorrect);
          const chosen = isCorrect ? correctOption : wrongOption;
          if (isCorrect) score += 1;
          answerRows.push({
            attemptId: attempt.id,
            questionId: question.id,
            selectedOptionIds: chosen ? [chosen.id] : [],
            isCorrect,
            pointsAwarded: isCorrect ? 1 : 0,
          });
        }
        await tx.insert(examAttemptQuestions).values(snapshotRows);
        await tx.insert(examAnswers).values(answerRows);
        await tx
          .update(examAttempts)
          .set({
            score,
            maxScore: createdQuestions.length,
            passed: score / createdQuestions.length >= 0.5,
          })
          .where(eq(examAttempts.id, attempt.id));
      }
    });
    process.stdout.write(
      `  ${Math.min(batch + batchSize, LOAD_TEST_HISTORICAL_ATTEMPTS)}/${LOAD_TEST_HISTORICAL_ATTEMPTS}\r`,
    );
  }
  console.log();

  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(`Quiz ID: ${quiz.id}`);
  console.log(`Class ID: ${cls.id}`);
}

main()
  .catch((error: unknown) => {
    console.error("Load test seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
