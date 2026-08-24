import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import {
  classStudents,
  classes,
  questions,
  quizAssignments,
  quizzes,
  students,
  teachers,
  users,
} from "@/database/schema";
import { hashPassword } from "@/backend/auth/password";
import type { AuthUser } from "@/backend/auth/session";
import type { QuestionInput } from "@/backend/questions/question.schema";
import { createQuestion } from "@/backend/questions/question.service";
import {
  createQuiz,
  publishQuiz,
  setQuizQuestionPool,
} from "@/backend/quizzes/quiz.service";
import {
  createAssignment,
  deleteAssignment,
  listAssignmentsForQuiz,
  listAssignmentsForStudent,
} from "@/backend/assignments/assignment.service";

// Requires `docker compose up -d` (PostgreSQL).
describe("assignment.service (integration)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let teacherId: string;
  let requester: AuthUser;
  let classId: string;
  let classStudentId: string;
  let directStudentId: string;
  let publishedQuizId: string;
  let draftQuizId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("irrelevant");

    const [teacher] = await db
      .insert(users)
      .values({
        email: `assignment-service-teacher-${suffix}@quizguard.test`,
        name: "Assignment Service Teacher",
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

    const [studentInClass] = await db
      .insert(users)
      .values({
        email: `assignment-service-class-student-${suffix}@quizguard.test`,
        name: "Class Student",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: studentInClass.id });
    classStudentId = studentInClass.id;
    userIds.push(studentInClass.id);

    const [directStudent] = await db
      .insert(users)
      .values({
        email: `assignment-service-direct-student-${suffix}@quizguard.test`,
        name: "Direct Student",
        role: "student",
        passwordHash,
      })
      .returning();
    await db.insert(students).values({ userId: directStudent.id });
    directStudentId = directStudent.id;
    userIds.push(directStudent.id);

    const [cls] = await db
      .insert(classes)
      .values({ name: `Assignment Class ${suffix}`, teacherId })
      .returning();
    classId = cls.id;
    await db
      .insert(classStudents)
      .values({ classId, studentId: classStudentId });

    const questionInput: QuestionInput = {
      type: "short_answer",
      subject: `Assignment Subject ${suffix}`,
      text: "Placeholder question",
      tags: [],
      points: 1,
      difficulty: "easy",
      options: [{ text: "42" }],
    };
    const question = await createQuestion(questionInput, teacherId);

    const publishedQuiz = await createQuiz(
      {
        title: `Published Quiz ${suffix}`,
        subject: questionInput.subject,
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
        questionsPerAttempt: 1,
      },
      teacherId,
    );
    await setQuizQuestionPool(publishedQuiz.id, [question.id], requester);
    await publishQuiz(publishedQuiz.id, requester);
    publishedQuizId = publishedQuiz.id;

    const draftQuiz = await createQuiz(
      {
        title: `Draft Quiz ${suffix}`,
        subject: questionInput.subject,
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
        questionsPerAttempt: 1,
      },
      teacherId,
    );
    draftQuizId = draftQuiz.id;
  });

  afterAll(async () => {
    await db
      .delete(quizAssignments)
      .where(inArray(quizAssignments.assignedBy, [teacherId]));
    await db.delete(quizzes).where(eq(quizzes.createdBy, teacherId));
    await db.delete(questions).where(eq(questions.createdBy, teacherId));
    await db.delete(classes).where(eq(classes.teacherId, teacherId));
    await db.delete(teachers).where(inArray(teachers.userId, userIds));
    await db.delete(students).where(inArray(students.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("refuses to assign a draft quiz", async () => {
    await expect(
      createAssignment(draftQuizId, { classId }, teacherId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("assigns a published quiz to a class", async () => {
    const assignment = await createAssignment(
      publishedQuizId,
      { classId },
      teacherId,
    );
    expect(assignment.classId).toBe(classId);
    expect(assignment.studentId).toBeNull();
  });

  it("rejects assigning the same quiz to the same class twice", async () => {
    await expect(
      createAssignment(publishedQuizId, { classId }, teacherId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("assigns the same quiz directly to an individual student", async () => {
    const assignment = await createAssignment(
      publishedQuizId,
      { studentId: directStudentId },
      teacherId,
    );
    expect(assignment.studentId).toBe(directStudentId);
    expect(assignment.classId).toBeNull();
  });

  it("lists assignments for a quiz with resolved target names", async () => {
    const list = await listAssignmentsForQuiz(publishedQuizId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const classAssignment = list.find((a) => a.classId === classId);
    expect(classAssignment?.targetName).toBe(`Assignment Class ${suffix}`);
    const studentAssignment = list.find((a) => a.studentId === directStudentId);
    expect(studentAssignment?.targetName).toBe("Direct Student");
  });

  it("shows the quiz to both the class-enrolled and directly-assigned student", async () => {
    const classStudentView = await listAssignmentsForStudent(classStudentId);
    expect(classStudentView.some((a) => a.quizId === publishedQuizId)).toBe(
      true,
    );
    expect(
      classStudentView.find((a) => a.quizId === publishedQuizId)?.assignedVia,
    ).toBe("class");

    const directStudentView = await listAssignmentsForStudent(directStudentId);
    expect(directStudentView.some((a) => a.quizId === publishedQuizId)).toBe(
      true,
    );
    expect(
      directStudentView.find((a) => a.quizId === publishedQuizId)?.assignedVia,
    ).toBe("student");
  });

  it("removes an assignment, which then disappears from both listings", async () => {
    const list = await listAssignmentsForQuiz(publishedQuizId);
    const studentAssignment = list.find((a) => a.studentId === directStudentId);
    if (!studentAssignment) throw new Error("expected assignment to exist");

    await deleteAssignment(publishedQuizId, studentAssignment.id);

    const afterDelete = await listAssignmentsForQuiz(publishedQuizId);
    expect(afterDelete.some((a) => a.id === studentAssignment.id)).toBe(false);

    const studentView = await listAssignmentsForStudent(directStudentId);
    expect(studentView.some((a) => a.quizId === publishedQuizId)).toBe(false);
  });

  it("404s deleting an assignment under the wrong quiz id", async () => {
    const list = await listAssignmentsForQuiz(publishedQuizId);
    const classAssignment = list.find((a) => a.classId === classId);
    if (!classAssignment) throw new Error("expected assignment to exist");

    await expect(
      deleteAssignment(draftQuizId, classAssignment.id),
    ).rejects.toMatchObject({ status: 404 });
  });
});
