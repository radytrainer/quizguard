import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { classInputSchema } from "@/backend/classes/class.schema";
import {
  deleteClass,
  getClass,
  updateClass,
} from "@/backend/classes/class.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/classes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const item = await getClass(id, user);

    return NextResponse.json({ class: item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/classes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const input = classInputSchema.parse(await request.json());
    const item = await updateClass(id, input, user);

    return NextResponse.json({ class: item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/classes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await deleteClass(id, user);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
