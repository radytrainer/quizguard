import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { assignmentInputSchema } from "@/backend/assignments/assignment.schema";
import {
  createAssignment,
  listAssignmentsForQuiz,
} from "@/backend/assignments/assignment.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/assignments">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
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
    const input = assignmentInputSchema.parse(await request.json());
    const assignment = await createAssignment(id, input, user.id);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
