import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { updateImportMapping } from "@/backend/imports/import.service";

const mappingUpdateSchema = z.object({
  mapping: z.record(z.string(), z.string().nullable()),
});

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/imports/[sessionId]/mapping">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { sessionId } = await ctx.params;
    const { mapping } = mappingUpdateSchema.parse(await request.json());
    const preview = await updateImportMapping(sessionId, user.id, mapping);

    return NextResponse.json(preview);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
