import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getSessionByJoinCode } from "@/backend/live/live.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/live/by-code/[code]">,
) {
  try {
    await requireApiUser();
    const { code } = await ctx.params;

    const { session, quizTitle, hostName } = await getSessionByJoinCode(code);

    return NextResponse.json({
      sessionId: session.id,
      quizTitle,
      hostName,
      status: session.status,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
