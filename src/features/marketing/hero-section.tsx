import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/backend/auth/session";
import { DashboardPreview } from "@/features/marketing/dashboard-preview";

export function HeroSection({ user }: { user: AuthUser | null }) {
  const ctaHref = user ? "/dashboard" : "/login";

  return (
    <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div
        aria-hidden="true"
        className="bg-primary/10 pointer-events-none absolute top-0 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <span className="border-border bg-secondary/60 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
            <Sparkles className="size-3.5" />
            Introducing Advanced Proctoring V2.0
          </span>

          <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl md:text-6xl">
            Simple quizzes.
            <br />
            <span className="text-primary">Smarter exams.</span>
            <br />
            Better monitoring.
          </h1>

          <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
            QuizGuard is the authoritative platform for secure, high-stakes
            educational assessments. Design robust quizzes, enforce rigorous
            exam conditions, and monitor student activity with unparalleled
            academic precision.
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href={ctaHref}>
                Create Quiz
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href={ctaHref}>
                Take a Quiz
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-16">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
