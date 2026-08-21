import { NextResponse } from "next/server";

import { apiErrorResponse, tooManyRequests } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { requireActiveAttemptForAnswering } from "@/backend/attempts/attempt.service";
import { recordViolationSchema } from "@/backend/monitoring/monitoring.schema";
import { recordViolation } from "@/backend/monitoring/monitoring.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/attempts/[attemptId]/violations">,
) {
  try {
    const user = await requireApiUser("student");

    // Generous relative to login/imports: legitimate rapid tab-switching or a flaky connection
    // reconnecting can fire several of these in quick succession during a real exam.
    const rateLimit = await checkRateLimit(`violation:${user.id}`, {
      limit: 60,
      windowSeconds: 5 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many activity reports. Slow down.");
    }

    const { attemptId } = await ctx.params;
    const input = recordViolationSchema.parse(await request.json());
    const attempt = await requireActiveAttemptForAnswering(attemptId, user.id);
    const locked = await recordViolation(attempt, input);

    return NextResponse.json({ success: true, locked });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
