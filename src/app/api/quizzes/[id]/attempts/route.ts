import { NextResponse } from "next/server";

import { apiErrorResponse, tooManyRequests } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { startAttempt } from "@/backend/attempts/attempt.service";
import { listAttemptsForQuiz } from "@/backend/monitoring/monitoring.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getQuiz(id, user);
    const attempts = await listAttemptsForQuiz(id);

    return NextResponse.json({ attempts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts">,
) {
  try {
    const user = await requireApiUser("student");

    const rateLimit = await checkRateLimit(`attempt-start:${user.id}`, {
      limit: 20,
      windowSeconds: 5 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many attempts to start a quiz. Slow down.");
    }

    const { id } = await ctx.params;
    const attempt = await startAttempt(id, user.id);

    return NextResponse.json({ attempt }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
