import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { LoginForm } from "@/features/auth/login-form";

// noindex: a sign-in form has no unique content for a search query, so it shouldn't compete
// with the homepage for "quiz"/"quizkh" search relevance — still crawlable (follow: true) so
// links from it (e.g. to /register) are discovered normally.
export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your QuizGuard (quizkh) account.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/login" },
};

export default async function LoginPage() {
  // Forces dynamic rendering — a statically-prerendered page has no per-request nonce to
  // attach to Next's own hydration script, so it can't work with proxy.ts's nonce-based CSP
  // (Phase 13, docs/ARCHITECTURE.md — Section 16). This was the one static page in the app.
  await connection();

  return (
    // `dark` activates the app's existing (otherwise-unused) dark palette for this one page —
    // deliberate: a proctoring-session look, not a light-mode toggle.
    <main className="dark bg-background text-foreground relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div
        aria-hidden="true"
        className="bg-primary/20 pointer-events-none absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="via-primary/25 animate-scan-sweep pointer-events-none absolute inset-x-0 h-32 bg-gradient-to-b from-transparent to-transparent blur-xl"
      />

      <div className="relative z-10 flex h-16 items-center px-6 sm:px-10">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="text-primary size-6" />
          <span className="text-lg font-bold tracking-tight">QuizGuard</span>
        </div>

        <span className="border-border bg-card/60 text-muted-foreground mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm">
          <span className="bg-success inline-block size-1.5 animate-pulse rounded-full" />
          Secure connection
        </span>

        <div className="border-border bg-card/80 w-full max-w-sm rounded-2xl border p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in with your admin, teacher, or student account.
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-primary font-medium hover:underline"
          >
            Register as a teacher
          </Link>
          , or contact your school administrator for a student account.
        </p>
      </div>
    </main>
  );
}
