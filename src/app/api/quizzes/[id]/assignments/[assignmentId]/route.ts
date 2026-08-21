import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { deleteAssignment } from "@/backend/assignments/assignment.service";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/assignments/[assignmentId]">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id, assignmentId } = await ctx.params;
    await deleteAssignment(id, assignmentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
