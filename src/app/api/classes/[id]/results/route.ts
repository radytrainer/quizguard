import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getClass } from "@/backend/classes/class.service";
import { getClassResults } from "@/backend/results/results.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/classes/[id]/results">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await getClass(id, user);
    const results = await getClassResults(id);

    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
