"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface ActivityStatus {
  examActive: boolean;
  liveActive: boolean;
}

const navItems = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    href: "/teacher/quizzes",
    label: "Quizzes",
    icon: ClipboardList,
    statusKey: "examActive" as const,
  },
  {
    href: "/teacher/live",
    label: "Live",
    icon: Radio,
    statusKey: "liveActive" as const,
  },
  { href: "/teacher/questions", label: "Question Bank", icon: Wallet },
  { href: "/teacher/classes", label: "Classes", icon: Users },
  { href: "/teacher/import", label: "Import", icon: Upload },
];

// How often the sidebar re-checks "is a student in the middle of an exam / live game right
// now" — frequent enough to feel current, cheap enough (two EXISTS queries) to poll rather
// than needing a dedicated realtime channel for what's just a sidebar badge.
const ACTIVITY_POLL_MS = 20_000;

export function TeacherSidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<ActivityStatus>({
    examActive: false,
    liveActive: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/teacher/activity-status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ActivityStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // A missed poll just means the badge stays at its last known value until the next
        // one succeeds — not worth surfacing as an error for a sidebar indicator.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), ACTIVITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
          "border-outline-variant bg-sidebar fixed top-0 left-0 z-50 flex h-full flex-col border-r p-6 transition-[transform,width] duration-200 ease-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-[280px] lg:w-20 lg:px-3" : "w-[280px]",
        )}
      >
        <div
          className={cn(
            "mb-10 flex items-center gap-2",
            collapsed ? "lg:justify-center" : "justify-between",
          )}
        >
          <div className={cn("flex flex-col gap-1", collapsed && "lg:hidden")}>
            <span className="text-primary text-2xl font-bold tracking-tight">
              QuizGuard
            </span>
            <span className="text-muted-foreground text-sm">
              Educator Portal
            </span>
          </div>
          {collapsed && (
            <ShieldCheck className="text-primary hidden size-7 lg:block" />
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-muted-foreground hover:bg-secondary hover:text-foreground hidden shrink-0 rounded-md p-1.5 transition-colors lg:block"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            const isHappeningNow = item.statusKey
              ? status[item.statusKey]
              : false;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
                title={
                  collapsed
                    ? `${item.label}${isHappeningNow ? " — active now" : ""}`
                    : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "lg:justify-center",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className="relative inline-flex shrink-0">
                  <Icon className="size-5" />
                  {isHappeningNow && (
                    <span
                      className="bg-success ring-sidebar absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full ring-2"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className={cn(collapsed && "lg:hidden")}>
                  {item.label}
                </span>
                {isHappeningNow && (
                  <span className="sr-only">(active now)</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
