import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { isGoogleAccountConnected } from "@/backend/imports/google-sheets.service";

export async function GET() {
  try {
    const user = await requireApiUser(["admin", "teacher"]);
    const connected = await isGoogleAccountConnected(user.id);
    return NextResponse.json({ connected });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
