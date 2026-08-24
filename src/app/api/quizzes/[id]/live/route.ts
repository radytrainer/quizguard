import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { getClass } from "@/backend/classes/class.service";
import { createLiveSessionSchema } from "@/backend/live/live.schema";
import { createLiveSession } from "@/backend/live/live.service";
import { getQuiz } from "@/backend/quizzes/quiz.service";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/quizzes/[id]/live">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;

    await getQuiz(id, requester);

    const input = createLiveSessionSchema.parse(await request.json());

    if (input.classId) {
      await getClass(input.classId, requester);
    }

    const session = await createLiveSession(requester.id, id, input);

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
