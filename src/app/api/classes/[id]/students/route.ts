import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { rosterAddSchema } from "@/backend/classes/class.schema";
import { addStudentToClass, listRoster } from "@/backend/classes/class.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/classes/[id]/students">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const roster = await listRoster(id, user);

    return NextResponse.json({ roster });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/classes/[id]/students">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const { studentId } = rosterAddSchema.parse(await request.json());
    await addStudentToClass(id, studentId, user);
    const roster = await listRoster(id, user);

    return NextResponse.json({ roster }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
