import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/backend/auth/session";

// Every current feature, all included — there's only one plan while the platform is free, so
// this isn't a "what's excluded from Free" list the way a paid-tier comparison would need.
const includedFeatures = [
  "Unlimited quizzes and question banks",
  "Randomized questions and answer order",
  "Timed exams with fullscreen lock and auto-submit",
  "Real-time activity monitoring during exams",
  "Live, Kahoot-style class games",
  "Results and performance analytics",
];

export function PricingSection({ user }: { user: AuthUser | null }) {
  const ctaHref = user ? "/dashboard" : "/login";

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <span className="border-border bg-secondary/60 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" />
          Simple pricing
        </span>

        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Free, while we grow
        </h1>
        <p className="text-muted-foreground mt-3 text-base sm:text-lg">
          QuizGuard is free for every teacher and student today. Paid plans may
          arrive later as the platform grows — this stays free in the meantime,
          with everything included.
        </p>

        <div className="border-border bg-card mx-auto mt-12 max-w-md rounded-2xl border p-8 text-left shadow-sm">
          <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Everyone, right now
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight">Free</span>
            <span className="text-muted-foreground text-sm">
              — no card required
            </span>
          </div>

          <ul className="mt-6 flex flex-col gap-3">
            {includedFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check className="text-success mt-0.5 size-4 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button size="lg" className="mt-8 w-full" asChild>
            <Link href={ctaHref}>
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <p className="text-muted-foreground mt-8 text-xs">
          We&apos;ll announce any paid plans well in advance — nothing changes
          for accounts already using QuizGuard for free.
        </p>
      </div>
    </section>
  );
}
