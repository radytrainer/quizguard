import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { searchStudents } from "@/backend/students/student.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const students = await searchStudents(search);

    return NextResponse.json({ students });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
