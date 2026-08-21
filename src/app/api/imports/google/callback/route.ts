import { NextResponse, type NextRequest } from "next/server";

import { requireApiUser } from "@/backend/auth/rbac";
import { connectGoogleAccount } from "@/backend/imports/google-sheets.service";

const STATE_COOKIE = "google_oauth_state";

// Google redirects the browser here as a full-page navigation, not an XHR call — errors
// redirect back to the import page with a flag rather than returning JSON (the pattern every
// other route in this app uses), since there's no client-side code here to parse a JSON body.
export async function GET(request: NextRequest) {
  const importPageUrl = new URL("/teacher/import", request.url);

  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;

    if (!code || !state || !cookieState || state !== cookieState) {
      importPageUrl.searchParams.set("googleError", "invalid_state");
      const response = NextResponse.redirect(importPageUrl);
      response.cookies.delete(STATE_COOKIE);
      return response;
    }

    const redirectUri = new URL(
      "/api/imports/google/callback",
      request.url,
    ).toString();
    await connectGoogleAccount(user.id, redirectUri, code);

    const response = NextResponse.redirect(importPageUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch {
    importPageUrl.searchParams.set("googleError", "connection_failed");
    return NextResponse.redirect(importPageUrl);
  }
}
