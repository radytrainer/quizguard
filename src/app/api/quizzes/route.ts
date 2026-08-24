import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import {
  quizInputSchema,
  quizListQuerySchema,
} from "@/backend/quizzes/quiz.schema";
import { createQuiz, listQuizzes } from "@/backend/quizzes/quiz.service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const query = quizListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await listQuizzes(query, user);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const input = quizInputSchema.parse(await request.json());
    const quiz = await createQuiz(input, user.id);

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
