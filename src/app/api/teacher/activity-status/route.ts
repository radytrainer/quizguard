import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getTeacherActivityStatus } from "@/backend/dashboard/dashboard.service";

export async function GET() {
  try {
    const user = await requireApiUser(["admin", "teacher"]);
    const status = await getTeacherActivityStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
