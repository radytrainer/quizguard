import { NextResponse } from "next/server";

import { apiErrorResponse, forbidden } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { createStudentSchema } from "@/backend/classes/class.schema";
import {
  createStudentInClass,
  getClass,
  listRoster,
} from "@/backend/classes/class.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/classes/[id]/students/create">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;

    // Admins may add students to any class; teachers only to their own.
    if (requester.role === "teacher") {
      const cls = await getClass(id);
      if (cls.teacherId !== requester.id) {
        throw forbidden("This class does not belong to you");
      }
    }

    const input = createStudentSchema.parse(await request.json());
    await createStudentInClass(id, input);
    const roster = await listRoster(id);

    return NextResponse.json({ roster }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
