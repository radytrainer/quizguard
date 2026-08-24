import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { unlockAttempt } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/[attemptId]/unlock">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id, attemptId } = await ctx.params;
    await getQuiz(id, user);
    await unlockAttempt(id, attemptId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
