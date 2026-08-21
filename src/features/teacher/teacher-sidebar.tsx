"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  Radio,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/teacher/quizzes", label: "Quizzes", icon: ClipboardList },
  { href: "/teacher/live", label: "Live", icon: Radio },
  { href: "/teacher/questions", label: "Question Bank", icon: Wallet },
  { href: "/teacher/classes", label: "Classes", icon: Users },
  { href: "/teacher/import", label: "Import", icon: Upload },
];

export function TeacherSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "border-outline-variant bg-sidebar fixed top-0 left-0 z-50 flex h-full w-[280px] flex-col border-r p-6 transition-transform duration-200 ease-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-10 flex flex-col gap-1">
          <span className="text-primary text-2xl font-bold tracking-tight">
            QuizGuard
          </span>
          <span className="text-muted-foreground text-sm">Educator Portal</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
