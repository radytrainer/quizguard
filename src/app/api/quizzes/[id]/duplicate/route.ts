import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { duplicateQuiz } from "@/backend/quizzes/quiz.service";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/duplicate">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const quiz = await duplicateQuiz(id, user);

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
