import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { removeStudentFromClass } from "@/backend/classes/class.service";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/classes/[id]/students/[studentId]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id, studentId } = await ctx.params;
    await removeStudentFromClass(id, studentId, user);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
