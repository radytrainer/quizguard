import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { updateUserSchema } from "@/backend/users/user.schema";
import { deleteUser, getUser, updateUser } from "@/backend/users/user.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/users/[id]">,
) {
  try {
    await requireApiUser("admin");

    const { id } = await ctx.params;
    const user = await getUser(id);

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/users/[id]">,
) {
  try {
    await requireApiUser("admin");

    const { id } = await ctx.params;
    const input = updateUserSchema.parse(await request.json());
    const user = await updateUser(id, input);

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/users/[id]">,
) {
  try {
    await requireApiUser("admin");

    const { id } = await ctx.params;
    await deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
