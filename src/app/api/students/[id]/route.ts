import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { updateStudentSchema } from "@/backend/classes/class.schema";
import { assertStudentInTeachersRoster } from "@/backend/classes/class.service";
import { deleteUser, updateStudentProfile } from "@/backend/users/user.service";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/students/[id]">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;
    await assertStudentInTeachersRoster(id, requester);

    const input = updateStudentSchema.parse(await request.json());
    const student = await updateStudentProfile(id, input);

    return NextResponse.json({ student });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/students/[id]">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;
    await assertStudentInTeachersRoster(id, requester);

    await deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
