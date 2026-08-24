import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getQuestionFilterFacets } from "@/backend/questions/question.service";

export async function GET() {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const facets = await getQuestionFilterFacets(user);

    return NextResponse.json(facets);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
