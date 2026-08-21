import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-response";
import { requireApiUser } from "@/backend/auth/rbac";
import { readGoogleSheetValues } from "@/backend/imports/google-sheets.service";
import { startImportPreview } from "@/backend/imports/import.service";

const googlePreviewSchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetTitle: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["admin", "teacher"]);

    const { spreadsheetId, spreadsheetName, sheetTitle } =
      googlePreviewSchema.parse(await request.json());

    const parsed = await readGoogleSheetValues(
      user.id,
      spreadsheetId,
      sheetTitle,
    );
    const preview = await startImportPreview(
      "google_sheets",
      `${spreadsheetName} — ${sheetTitle}`,
      parsed,
      user.id,
    );

    return NextResponse.json(preview);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
