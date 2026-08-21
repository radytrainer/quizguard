import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { UserList } from "@/features/admin/user-list";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return <UserList />;
}
