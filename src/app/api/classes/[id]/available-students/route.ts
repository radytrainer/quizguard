import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { searchAvailableStudents } from "@/backend/classes/class.service";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/classes/[id]/available-students">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const students = await searchAvailableStudents(id, search, user);

    return NextResponse.json({ students });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
