import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Users,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/backend/auth/session";
import { listClasses } from "@/backend/classes/class.service";
import { listQuizzes } from "@/backend/quizzes/quiz.service";
import { listUsers } from "@/backend/users/user.service";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

function formatDate(value: Date): string {
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xl leading-none font-bold">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{label}</p>
      </div>
    </Link>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const [teachers, students, quizzes, classes, recentUsers] = await Promise.all(
    [
      listUsers({ role: "teacher", page: 1, pageSize: 1 }),
      listUsers({ role: "student", page: 1, pageSize: 1 }),
      listQuizzes({ page: 1, pageSize: 1 }, user),
      listClasses({ page: 1, pageSize: 1 }, user),
      listUsers({ page: 1, pageSize: 5 }),
    ],
  );

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Welcome back, {user.name}.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/admin/users">
            Manage Users
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={GraduationCap}
          label="Teachers"
          value={teachers.total}
          href="/admin/users"
        />
        <StatCard
          icon={UsersRound}
          label="Students"
          value={students.total}
          href="/admin/users"
        />
        <StatCard
          icon={ClipboardList}
          label="Quizzes"
          value={quizzes.total}
          href="/teacher/quizzes"
        />
        <StatCard
          icon={BookOpen}
          label="Classes"
          value={classes.total}
          href="/teacher/classes"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Recently created accounts
          </h2>
          <p className="text-muted-foreground text-sm">
            The newest admin, teacher, and student accounts on the platform.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {recentUsers.items.map((account) => (
            <div
              key={account.id}
              className="border-border flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {account.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <span className="text-muted-foreground text-xs">
                  Joined {formatDate(account.createdAt)}
                </span>
                <Badge variant="outline">{ROLE_LABELS[account.role]}</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
