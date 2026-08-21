import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getAttemptDetailForTeacher } from "@/backend/monitoring/monitoring.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/attempts/[attemptId]">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id, attemptId } = await ctx.params;
    const attempt = await getAttemptDetailForTeacher(id, attemptId);

    return NextResponse.json({ attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
