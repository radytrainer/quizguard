import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { quizInputSchema } from "@/backend/quizzes/quiz.schema";
import {
  deleteQuiz,
  getQuiz,
  updateQuiz,
} from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const quiz = await getQuiz(id, user);

    return NextResponse.json({ quiz });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/quizzes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const input = quizInputSchema.parse(await request.json());
    const quiz = await updateQuiz(id, input, user);

    return NextResponse.json({ quiz });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]">,
) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    await deleteQuiz(id, user);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
