import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { deleteAssignment } from "@/backend/assignments/assignment.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/assignments/[assignmentId]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id, assignmentId } = await ctx.params;
    await getQuiz(id, user);
    await deleteAssignment(id, assignmentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
