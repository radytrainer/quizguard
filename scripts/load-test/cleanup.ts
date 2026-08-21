/**
 * Removes everything seed.ts created. Deletion order matters: `exam_attempts.quiz_id`,
 * `quiz_questions.question_id`, and `classes.teacher_id` are all `onDelete: "restrict"` (Section
 * 9/database schema design — history shouldn't silently vanish if a parent row is deleted), so
 * attempts must go before quizzes, and quizzes before questions and classes before users, or
 * Postgres rejects the delete. Everything else (answers, attempt-question snapshots,
 * quiz_questions, quiz_assignments, class_students, teachers/students) cascades automatically.
 * Safe to run repeatedly; matches purely on the `loadtest-*@quizguard.test` / "Load Test *"
 * naming convention seed.ts uses, so it can't touch real data.
 */
import { eq, inArray, like } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import {
  classes,
  examAttempts,
  questions,
  quizzes,
  users,
} from "@/database/schema";
import {
  LOAD_TEST_CLASS_NAME,
  LOAD_TEST_QUIZ_TITLE,
  LOAD_TEST_TEACHER_EMAIL,
} from "./config";

async function main() {
  const quizIds = (
    await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(eq(quizzes.title, LOAD_TEST_QUIZ_TITLE))
  ).map((q) => q.id);

  if (quizIds.length > 0) {
    const deletedAttempts = await db
      .delete(examAttempts)
      .where(inArray(examAttempts.quizId, quizIds))
      .returning({ id: examAttempts.id });
    console.log(
      `Deleted ${deletedAttempts.length} load-test attempt(s) (cascades to their answers and attempt-question snapshots).`,
    );
  }

  const deletedQuizzes = await db
    .delete(quizzes)
    .where(eq(quizzes.title, LOAD_TEST_QUIZ_TITLE))
    .returning({ id: quizzes.id });
  console.log(
    `Deleted ${deletedQuizzes.length} load-test quiz(zes) (cascades to quiz_questions, quiz_assignments).`,
  );

  const deletedQuestions = await db
    .delete(questions)
    .where(like(questions.text, "Load test question%"))
    .returning({ id: questions.id });
  console.log(`Deleted ${deletedQuestions.length} load-test question(s).`);

  const deletedClasses = await db
    .delete(classes)
    .where(eq(classes.name, LOAD_TEST_CLASS_NAME))
    .returning({ id: classes.id });
  console.log(
    `Deleted ${deletedClasses.length} load-test class(es) (cascades to class_students).`,
  );

  const deletedUsers = await db
    .delete(users)
    .where(like(users.email, "loadtest-%@quizguard.test"))
    .returning({ id: users.id });
  console.log(
    `Deleted ${deletedUsers.length} load-test user account(s) (cascades to their students/teachers rows).`,
  );

  console.log(
    `\nDone. (Teacher email was ${LOAD_TEST_TEACHER_EMAIL} — gone too.)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Load test cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
