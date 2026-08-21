import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import {
  classInputSchema,
  classListQuerySchema,
} from "@/backend/classes/class.schema";
import { createClass, listClasses } from "@/backend/classes/class.service";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["admin", "teacher"]);

    const query = classListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const result = await listClasses(query);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const input = classInputSchema.parse(await request.json());
    const created = await createClass(input, user.id);

    return NextResponse.json({ class: created }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
