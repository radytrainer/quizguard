import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { AdminShell } from "@/features/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // UX-only: keeps unauthorized users from seeing the shell at all. Not the security
  // boundary — see docs/ARCHITECTURE.md — Section 4: each page still checks for itself.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return <AdminShell userName={user.name}>{children}</AdminShell>;
}
