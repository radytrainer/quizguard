import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { env } from "@/lib/env";
import { requireApiUser } from "@/backend/auth/rbac";
import { getGoogleAuthUrl } from "@/backend/imports/google-sheets.service";

const STATE_COOKIE = "google_oauth_state";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const redirectUri = new URL(
      "/api/imports/google/callback",
      request.url,
    ).toString();
    const state = randomBytes(16).toString("base64url");

    const response = NextResponse.redirect(
      getGoogleAuthUrl(redirectUri, state),
    );
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/imports/google",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
