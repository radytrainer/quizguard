import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse, tooManyRequests } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionByJoinCode } from "@/backend/live/live.service";

// Deliberately no requireApiUser() here — the "anyone with the code" guest path
// (features/live/guest-join-form.tsx) has no account and no session cookie to check, and the
// join code itself is what gates access (same trust model as Kahoot's game PIN). That does
// make this the one API route in the app a client can hit with no auth at all, so unlike every
// other route here, it needs its own rate limit rather than relying on requireApiUser's
// implicit "must be logged in" friction.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/live/by-code/[code]">,
) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rateLimit = await checkRateLimit(`live-by-code:${ip}`, {
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many attempts. Try again in a minute.");
    }

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
