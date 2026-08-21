import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { listAssignmentsForStudent } from "@/backend/assignments/assignment.service";

export async function GET() {
  try {
    const user = await requireApiUser("student");

    const assignments = await listAssignmentsForStudent(user.id);

    return NextResponse.json({ assignments });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
