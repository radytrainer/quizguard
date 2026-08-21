import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { disconnectGoogleAccount } from "@/backend/imports/google-sheets.service";

export async function POST() {
  try {
    const user = await requireApiUser(["admin", "teacher"]);
    await disconnectGoogleAccount(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
