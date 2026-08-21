import { NextResponse } from "next/server";

import { apiErrorResponse, tooManyRequests } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { commitImport } from "@/backend/imports/import.service";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/imports/[sessionId]/commit">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    // Shares the "import:" bucket with /api/imports/preview — both represent the same abuse
    // surface (repeated bulk-write attempts), so a burst of either counts against one limit.
    const rateLimit = await checkRateLimit(`import:${user.id}`, {
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many import commits. Try again shortly.");
    }

    const { sessionId } = await ctx.params;
    const result = await commitImport(sessionId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
