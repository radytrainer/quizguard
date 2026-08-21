import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
