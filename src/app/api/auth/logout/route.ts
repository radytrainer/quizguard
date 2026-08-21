import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse, forbidden } from "@/lib/api-response";
import { isSameOrigin } from "@/lib/same-origin";
import { logout } from "@/backend/auth/auth.service";
import { clearSessionCookie, getSessionToken } from "@/backend/auth/session";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw forbidden();

    const token = await getSessionToken();
    if (token) await logout(token);
    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
