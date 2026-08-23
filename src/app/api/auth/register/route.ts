import { NextResponse, type NextRequest } from "next/server";

import {
  apiErrorResponse,
  forbidden,
  tooManyRequests,
} from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { registerSchema } from "@/backend/auth/auth.schema";
import { register } from "@/backend/auth/auth.service";
import { setSessionCookie } from "@/backend/auth/session";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw forbidden();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    // Stricter than login's 10/15min — creating an account is more abuse-prone (spam
    // accounts, email-enumeration probing via the conflict error) than a login attempt.
    const rateLimit = await checkRateLimit(`register:${ip}`, {
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many attempts. Try again in a few minutes.");
    }

    const input = registerSchema.parse(await request.json());
    const { user, sessionToken } = await register(input);
    await setSessionCookie(sessionToken);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
