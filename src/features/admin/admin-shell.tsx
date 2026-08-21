"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminSidebar } from "@/features/admin/admin-sidebar";
import { LogoutButton } from "@/features/auth/logout-button";

export function AdminShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col lg:pl-[280px]">
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
