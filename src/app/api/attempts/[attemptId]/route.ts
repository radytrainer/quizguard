import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getAttempt } from "@/backend/attempts/attempt.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/attempts/[attemptId]">,
) {
  try {
    const user = await requireApiUser("student");

    const { attemptId } = await ctx.params;
    const attempt = await getAttempt(attemptId, user.id);

    return NextResponse.json({ attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
