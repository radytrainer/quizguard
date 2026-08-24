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

    // Generous, IP-only: guards against broad automated abuse from one source, not against a
    // single account being brute-forced (that's the per-account check below). Deliberately high
    // — a classroom of students sharing one school/NAT IP during an exam can easily produce
    // dozens of legitimate login attempts within a few minutes, and a low IP-wide ceiling here
    // previously meant one student's typos could lock out the rest of the class.
    const ipLimit = await checkRateLimit(`login:ip:${ip}`, {
      limit: 100,
      windowSeconds: 15 * 60,
    });
    if (!ipLimit.allowed) {
      throw tooManyRequests(
        "Too many login attempts. Try again in a few minutes.",
      );
    }

    const input = loginSchema.parse(await request.json());

    // The actual brute-force protection, scoped to the account being targeted rather than the
    // source IP — so it can't be tripped by other students' unrelated attempts sharing the same
    // network, and still limits repeated guessing against any one account regardless of IP.
    const accountLimit = await checkRateLimit(`login:email:${input.email}`, {
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!accountLimit.allowed) {
      throw tooManyRequests(
        "Too many login attempts for this account. Try again in a few minutes.",
      );
    }

    const { user, sessionToken } = await login(input);
    await setSessionCookie(sessionToken);

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
