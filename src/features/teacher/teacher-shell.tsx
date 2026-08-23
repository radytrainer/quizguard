"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/logout-button";
import { SIDEBAR_COLLAPSE_COOKIE } from "@/features/teacher/sidebar-collapse";
import { TeacherSidebar } from "@/features/teacher/teacher-sidebar";
import { cn } from "@/lib/utils";

function persistCollapsed(value: boolean) {
  try {
    // A plain (non-httpOnly) cookie, not localStorage — teacher-layout.tsx (a Server
    // Component) reads it to render the correct expanded/collapsed state on the very first
    // paint. localStorage isn't visible to the server at all, which is exactly what caused
    // the hydration mismatch this replaced: the server always guessed "expanded" while the
    // client's first render already knew the real (possibly collapsed) preference.
    document.cookie = `${SIDEBAR_COLLAPSE_COOKIE}=${value ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // Cookie writes can be blocked (privacy settings) — the toggle still works for this tab,
    // it just won't be remembered on the next visit.
  }
}

export function TeacherShell({
  userName,
  initialCollapsed,
  children,
}: {
  userName: string;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen">
      <TeacherSidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <div
        className={cn(
          "flex flex-1 flex-col transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-20" : "lg:pl-[280px]",
        )}
      >
        <header className="border-outline-variant bg-card sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-muted-foreground truncate text-sm">
              Signed in as {userName}
            </span>
          </div>
          <LogoutButton />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
