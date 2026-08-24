import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";

import { RegisterForm } from "@/features/auth/register-form";

// noindex, same reasoning as login/page.tsx's metadata — a signup form isn't unique content to
// rank on, so it stays out of search results in favor of the homepage.
export const metadata: Metadata = {
  title: "Create a Teacher Account",
  description:
    "Register a free QuizGuard (quizkh) teacher account to start building quizzes and exams.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/register" },
};

export default async function RegisterPage() {
  // Forces dynamic rendering — a statically-prerendered page has no per-request nonce to
  // attach to Next's own hydration script, so it can't work with proxy.ts's nonce-based CSP
  // (same reasoning as login/page.tsx, the only other page that needs this).
  await connection();

  return (
    // `dark` activates the app's existing (otherwise-unused) dark palette for this one page —
    // same treatment as login/page.tsx, for visual consistency between the two auth pages.
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
            <h1 className="text-xl font-bold tracking-tight">
              Create a teacher account
            </h1>
            <p className="text-muted-foreground text-sm">
              Self-registration is open for teachers only right now — student
              and admin accounts are added by your school.
            </p>
          </div>

          {/* Deliberately loud (not just small muted text like the paragraph above) — students
              following the homepage's sign-up button were landing here and creating themselves
              teacher accounts by accident before this existed. */}
          <div className="border-warning/30 bg-warning/10 text-warning mb-6 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-semibold">Are you a student?</span> You
              don&apos;t need to sign up here — your teacher creates your login
              for you. Ask them for your email and password, then{" "}
              <Link
                href="/login"
                className="font-medium underline underline-offset-2"
              >
                sign in
              </Link>
              .
            </p>
          </div>

          <RegisterForm />
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
