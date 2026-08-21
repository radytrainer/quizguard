import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { listGoogleSheetTabs } from "@/backend/imports/google-sheets.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/imports/google/spreadsheets/[id]/sheets">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;
    const sheets = await listGoogleSheetTabs(user.id, id);
    return NextResponse.json({ sheets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
