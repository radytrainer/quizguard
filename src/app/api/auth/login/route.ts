import { NextResponse, type NextRequest } from "next/server";

import {
  apiErrorResponse,
  forbidden,
  tooManyRequests,
} from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { loginSchema } from "@/backend/auth/auth.schema";
import { login } from "@/backend/auth/auth.service";
import { setSessionCookie } from "@/backend/auth/session";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw forbidden();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rateLimit = await checkRateLimit(`login:${ip}`, {
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests(
        "Too many login attempts. Try again in a few minutes.",
      );
    }

    const input = loginSchema.parse(await request.json());
    const { user, sessionToken } = await login(input);
    await setSessionCookie(sessionToken);

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
