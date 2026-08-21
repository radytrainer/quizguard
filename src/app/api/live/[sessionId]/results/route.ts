import { NextResponse } from "next/server";

import { apiErrorResponse, forbidden } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getSessionResults, requireSession } from "@/backend/live/live.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/live/[sessionId]/results">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { sessionId } = await ctx.params;

    const session = await requireSession(sessionId);
    if (requester.role === "teacher" && session.hostId !== requester.id) {
      throw forbidden("This game does not belong to you");
    }

    const results = await getSessionResults(sessionId);
    return NextResponse.json(results);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
