import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import {
  createUserSchema,
  userListQuerySchema,
} from "@/backend/users/user.schema";
import { createUser, listUsers } from "@/backend/users/user.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser("admin");

    const query = userListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await listUsers(query);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireApiUser("admin");

    const input = createUserSchema.parse(await request.json());
    const user = await createUser(input);

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
