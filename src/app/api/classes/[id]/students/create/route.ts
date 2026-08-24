import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { createStudentSchema } from "@/backend/classes/class.schema";
import {
  createStudentInClass,
  listRoster,
} from "@/backend/classes/class.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/classes/[id]/students/create">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;

    const input = createStudentSchema.parse(await request.json());
    await createStudentInClass(id, input, requester);
    const roster = await listRoster(id, requester);

    return NextResponse.json({ roster }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
