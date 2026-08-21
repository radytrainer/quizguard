import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { listAttemptHistory } from "@/backend/attempts/attempt.service";

export async function GET() {
  try {
    const user = await requireApiUser("student");

    const attempts = await listAttemptHistory(user.id);

    return NextResponse.json({ attempts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
