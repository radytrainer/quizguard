import { NextResponse } from "next/server";

import { apiErrorResponse, forbidden } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { deleteSession, requireSession } from "@/backend/live/live.service";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/live/[sessionId]">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { sessionId } = await ctx.params;

    const session = await requireSession(sessionId);
    if (requester.role === "teacher" && session.hostId !== requester.id) {
      throw forbidden("This game does not belong to you");
    }

    await deleteSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
