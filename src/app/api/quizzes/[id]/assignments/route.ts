import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { assignmentInputSchema } from "@/backend/assignments/assignment.schema";
import {
  createAssignment,
  listAssignmentsForQuiz,
} from "@/backend/assignments/assignment.service";
import { getClass } from "@/backend/classes/class.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/assignments">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getQuiz(id, user);
    const assignments = await listAssignmentsForQuiz(id);

    return NextResponse.json({ assignments });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/assignments">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getQuiz(id, user);
    const input = assignmentInputSchema.parse(await request.json());
    if (input.classId) {
      await getClass(input.classId, user);
    }
    const assignment = await createAssignment(id, input, user.id);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
