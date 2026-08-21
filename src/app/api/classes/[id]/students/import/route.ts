import { NextResponse, type NextRequest } from "next/server";

import {
  apiErrorResponse,
  conflict,
  forbidden,
  tooManyRequests,
} from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/backend/auth/rbac";
import { parseCsv } from "@/backend/imports/csv-parser";
import { parseExcel } from "@/backend/imports/excel-parser";
import { MAX_IMPORT_FILE_BYTES } from "@/backend/imports/parse-limits";
import { createStudentSchema } from "@/backend/classes/class.schema";
import {
  createStudentInClass,
  getClass,
  listRoster,
} from "@/backend/classes/class.service";

const MAX_MB = MAX_IMPORT_FILE_BYTES / (1024 * 1024);

const FIELD_ALIASES = {
  name: ["name", "full name", "student name"],
  email: ["email", "email address"],
  password: ["password", "temp password", "temporary password"],
  gender: ["gender", "sex"],
} as const;

function findHeader(headers: string[], aliases: readonly string[]) {
  return headers.find((header) =>
    aliases.includes(header.trim().toLowerCase()),
  );
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/classes/[id]/students/import">,
) {
  try {
    const requester = await requireApiUser(["admin", "teacher"]);
    const { id } = await ctx.params;

    // Admins may import into any class; teachers only into their own.
    if (requester.role === "teacher") {
      const cls = await getClass(id);
      if (cls.teacherId !== requester.id) {
        throw forbidden("This class does not belong to you");
      }
    }

    const rateLimit = await checkRateLimit(`import-students:${requester.id}`, {
      limit: 10,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      throw tooManyRequests("Too many import uploads. Try again shortly.");
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMPORT_FILE_BYTES) {
      throw conflict(`File exceeds the ${MAX_MB}MB limit`);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw conflict("No file was uploaded");
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw conflict(`File exceeds the ${MAX_MB}MB limit`);
    }

    const isExcel =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type.includes("spreadsheet");
    const parsed = isExcel
      ? await parseExcel(await file.arrayBuffer())
      : parseCsv(await file.text());

    const columns = {
      name: findHeader(parsed.headers, FIELD_ALIASES.name),
      email: findHeader(parsed.headers, FIELD_ALIASES.email),
      password: findHeader(parsed.headers, FIELD_ALIASES.password),
      gender: findHeader(parsed.headers, FIELD_ALIASES.gender),
    };
    const missing = Object.entries(columns)
      .filter(([, header]) => !header)
      .map(([field]) => field);
    if (missing.length > 0) {
      throw conflict(`Missing required column(s): ${missing.join(", ")}`);
    }

    const errors: { row: number; message: string }[] = [];
    let successCount = 0;

    for (let i = 0; i < parsed.rows.length; i++) {
      const raw = parsed.rows[i];
      const rowNumber = i + 2; // header occupies row 1

      const candidate = {
        name: raw[columns.name!] ?? "",
        email: raw[columns.email!] ?? "",
        password: raw[columns.password!] ?? "",
        gender: (raw[columns.gender!] ?? "").trim().toLowerCase(),
      };

      const result = createStudentSchema.safeParse(candidate);
      if (!result.success) {
        errors.push({
          row: rowNumber,
          message: result.error.issues.map((issue) => issue.message).join("; "),
        });
        continue;
      }

      try {
        await createStudentInClass(id, result.data);
        successCount++;
      } catch (err) {
        errors.push({
          row: rowNumber,
          message:
            err instanceof Error ? err.message : "Failed to create student",
        });
      }
    }

    const roster = await listRoster(id);

    return NextResponse.json({
      roster,
      totalRows: parsed.rows.length,
      successCount,
      errorCount: errors.length,
      errors,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
