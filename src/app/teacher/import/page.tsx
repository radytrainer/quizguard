import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { ImportPage } from "@/features/imports/import-page";

export default async function TeacherImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return (
    <Suspense>
      <ImportPage />
    </Suspense>
  );
}
