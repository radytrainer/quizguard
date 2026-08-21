import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { questionInputSchema } from "@/backend/questions/question.schema";
import {
  deleteQuestion,
  getQuestion,
  updateQuestion,
} from "@/backend/questions/question.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/questions/[id]">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const question = await getQuestion(id);

    return NextResponse.json({ question });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/questions/[id]">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const input = questionInputSchema.parse(await request.json());
    const question = await updateQuestion(id, input);

    return NextResponse.json({ question });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/questions/[id]">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await deleteQuestion(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
