import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { ClassList } from "@/features/classes/class-list";

export default async function ClassesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/dashboard");

  return <ClassList />;
}
