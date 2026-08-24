import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getActivityHistory } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/activity">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getQuiz(id, user);
    const events = await getActivityHistory(id);

    return NextResponse.json({ events });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
