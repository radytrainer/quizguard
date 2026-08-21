import { NextResponse } from "next/server";

import { apiErrorResponse, forbidden } from "@/lib/api-response";
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

    const quiz = await getQuiz(id);
    if (requester.role === "teacher" && quiz.createdBy !== requester.id) {
      throw forbidden("This quiz does not belong to you");
    }

    const input = createLiveSessionSchema.parse(await request.json());

    if (input.classId) {
      const cls = await getClass(input.classId);
      if (requester.role === "teacher" && cls.teacherId !== requester.id) {
        throw forbidden("This class does not belong to you");
      }
    }

    const session = await createLiveSession(requester.id, id, input);

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
