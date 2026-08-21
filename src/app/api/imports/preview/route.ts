import { NextResponse, type NextRequest } from "next/server";

import {
  apiErrorResponse,
  conflict,
  tooManyRequests,
} from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { parseCsv } from "@/backend/imports/csv-parser";
import { parseExcel } from "@/backend/imports/excel-parser";
import { startImportPreview } from "@/backend/imports/import.service";
import { MAX_IMPORT_FILE_BYTES } from "@/backend/imports/parse-limits";

const MAX_MB = MAX_IMPORT_FILE_BYTES / (1024 * 1024);

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const rateLimit = await checkRateLimit(`import:${user.id}`, {
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many import uploads. Try again shortly.");
    }

    // Fail fast on an oversized upload before buffering the body into memory.
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMPORT_FILE_BYTES) {
      throw conflict(`File exceeds the ${MAX_MB}MB limit`);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw conflict("No file was uploaded");
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw conflict(`File exceeds the ${MAX_MB}MB limit`);
    }

    const isExcel =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type.includes("spreadsheet");

    const parsed = isExcel
      ? await parseExcel(await file.arrayBuffer())
      : parseCsv(await file.text());

    const preview = await startImportPreview(
      isExcel ? "excel" : "csv",
      file.name,
      parsed,
      user.id,
    );

    return NextResponse.json(preview);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
