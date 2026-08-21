import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import {
  bulkDeleteQuestionsSchema,
  questionInputSchema,
  questionListQuerySchema,
} from "@/backend/questions/question.schema";
import {
  createQuestion,
  deleteQuestions,
  listQuestions,
} from "@/backend/questions/question.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const query = questionListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await listQuestions(query);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const input = questionInputSchema.parse(await request.json());
    const question = await createQuestion(input, user.id);

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const { ids } = bulkDeleteQuestionsSchema.parse(await request.json());
    const deletedCount = await deleteQuestions(ids);

    return NextResponse.json({ deletedCount });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
