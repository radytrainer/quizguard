import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { gradeAnswerSchema } from "@/backend/answers/answer.schema";
import { gradeAnswer } from "@/backend/answers/answer.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/[attemptId]/answers/[questionId]/grade">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id, attemptId, questionId } = await ctx.params;
    await getQuiz(id, user); // throws 403/404 — same ownership check every sibling route uses
    const input = gradeAnswerSchema.parse(await request.json());

    await gradeAnswer(id, attemptId, questionId, input, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
