import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { saveAnswer } from "@/backend/answers/answer.service";
import { saveAnswerSchema } from "@/backend/answers/answer.schema";
import { requireActiveAttemptForAnswering } from "@/backend/attempts/attempt.service";

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/attempts/[attemptId]/answers">,
) {
  try {
    const user = await requireApiUser("student");

    const { attemptId } = await ctx.params;
    const input = saveAnswerSchema.parse(await request.json());
    const attempt = await requireActiveAttemptForAnswering(attemptId, user.id);
    await saveAnswer(attempt, input);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
