import { NextResponse } from "next/server";

import { getHealthReport } from "@/backend/health/health.service";

export async function GET() {
  const report = await getHealthReport();
  return NextResponse.json(report, {
    status: report.status === "healthy" ? 200 : 503,
  });
}
