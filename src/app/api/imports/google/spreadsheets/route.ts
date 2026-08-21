import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { listGoogleSpreadsheets } from "@/backend/imports/google-sheets.service";

export async function GET() {
  try {
    const user = await requireApiUser(["admin", "teacher"]);
    const spreadsheets = await listGoogleSpreadsheets(user.id);
    return NextResponse.json({ spreadsheets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
