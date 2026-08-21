import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { unlockAttempt } from "@/backend/monitoring/monitoring.service";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/[attemptId]/unlock">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id, attemptId } = await ctx.params;
    await unlockAttempt(id, attemptId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
