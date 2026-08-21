import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { resetPasswordSchema } from "@/backend/users/user.schema";
import { resetUserPassword } from "@/backend/users/user.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/users/[id]/reset-password">,
) {
  try {
    await requireApiUser("admin");

    const { id } = await ctx.params;
    const { password } = resetPasswordSchema.parse(await request.json());
    await resetUserPassword(id, password);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
