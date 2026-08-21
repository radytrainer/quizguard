import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { TeacherShell } from "@/features/teacher/teacher-shell";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // UX-only: keeps unauthorized users from seeing the shell at all. Not the security
  // boundary — see docs/ARCHITECTURE.md — Section 4: each page still checks for itself,
  // since layouts don't reliably re-run on client-side navigation between sibling routes.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return <TeacherShell userName={user.name}>{children}</TeacherShell>;
}
