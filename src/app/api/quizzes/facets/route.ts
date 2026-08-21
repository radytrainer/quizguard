import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getQuizFilterFacets } from "@/backend/quizzes/quiz.service";

export async function GET() {
  try {
    await requireApiUser(["admin", "teacher"]);

    const facets = await getQuizFilterFacets();

    return NextResponse.json(facets);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
