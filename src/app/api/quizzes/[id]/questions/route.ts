import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { quizQuestionPoolSchema } from "@/backend/quizzes/quiz.schema";
import {
  getQuizQuestionPool,
  setQuizQuestionPool,
} from "@/backend/quizzes/quiz.service";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/questions">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const pool = await getQuizQuestionPool(id);

    return NextResponse.json({ pool });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/questions">,
) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { id } = await ctx.params;
    const { questionIds } = quizQuestionPoolSchema.parse(await request.json());
    await setQuizQuestionPool(id, questionIds);
    const pool = await getQuizQuestionPool(id);

    return NextResponse.json({ pool });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
