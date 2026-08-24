import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getAttemptDetailForTeacher } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/[attemptId]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id, attemptId } = await ctx.params;
    await getQuiz(id, user);
    const attempt = await getAttemptDetailForTeacher(id, attemptId);

    return NextResponse.json({ attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
