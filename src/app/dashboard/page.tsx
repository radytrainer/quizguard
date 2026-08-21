import { redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";

const roleHome = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
} as const;

// Proxy sends authenticated users to `/login` here (it only knows a session cookie exists,
// not the role). This page does the one Redis lookup needed to find out and forwards them —
// the authoritative check the docs recommend keeping out of Proxy.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  redirect(user ? roleHome[user.role] : "/login");
}
