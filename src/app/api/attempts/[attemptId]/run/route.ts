import { NextResponse } from "next/server";

import { apiErrorResponse, tooManyRequests } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { requireActiveAttemptForAnswering } from "@/backend/attempts/attempt.service";
import { runCodeSchema } from "@/backend/execution/execution.schema";
import { runCodeForAttempt } from "@/backend/answers/answer.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/attempts/[attemptId]/run">,
) {
  try {
    const user = await requireApiUser("student");

    const { attemptId } = await ctx.params;

    // Per-attempt, not per-user/IP: the abuse surface here is one student hammering a shared
    // Piston sandbox during their own timed exam, not sending N requests from N IPs — and each
    // attempt is already bounded by the quiz's own duration/maxAttempts.
    const rateLimit = await checkRateLimit(`code-run:${attemptId}`, {
      limit: 20,
      windowSeconds: 5 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many runs. Slow down.");
    }

    const input = runCodeSchema.parse(await request.json());
    const attempt = await requireActiveAttemptForAnswering(attemptId, user.id);
    const result = await runCodeForAttempt(attempt, input.questionId, input.code);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
