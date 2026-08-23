import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/backend/auth/session";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader({ user }: { user: AuthUser | null }) {
  const signedInHref = user ? "/dashboard" : "/login";

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <ShieldCheck className="text-primary size-6" />
          <span className="text-lg font-bold tracking-tight">QuizGuard</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!user && (
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href={signedInHref}>Sign In</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={signedInHref}>
              {user ? "Go to Dashboard" : "Get Started"}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
