import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getQuizResults } from "@/backend/results/results.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/results">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getQuiz(id, user);
    const results = await getQuizResults(id);

    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
