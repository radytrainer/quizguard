import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { publishQuiz } from "@/backend/quizzes/quiz.service";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/publish">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const quiz = await publishQuiz(id);

    return NextResponse.json({ quiz });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
