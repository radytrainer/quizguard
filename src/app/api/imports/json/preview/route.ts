import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiErrorResponse,
  conflict,
  tooManyRequests,
} from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { parseJsonQuestions } from "@/backend/imports/json-parser";
import { startImportPreview } from "@/backend/imports/import.service";
import { MAX_IMPORT_FILE_BYTES } from "@/backend/imports/parse-limits";

const MAX_MB = MAX_IMPORT_FILE_BYTES / (1024 * 1024);

const jsonPreviewSchema = z.object({
  json: z.string().min(1, "Paste some JSON first"),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const rateLimit = await checkRateLimit(`import:${user.id}`, {
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many import uploads. Try again shortly.");
    }

    const { json } = jsonPreviewSchema.parse(await request.json());
    if (json.length > MAX_IMPORT_FILE_BYTES) {
      throw conflict(`Pasted JSON exceeds the ${MAX_MB}MB limit`);
    }

    const parsed = parseJsonQuestions(json);
    const preview = await startImportPreview("json", null, parsed, user.id);

    return NextResponse.json(preview);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
