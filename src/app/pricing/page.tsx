import type { Metadata } from "next";

import { getCurrentUser } from "@/backend/auth/session";
import { PricingSection } from "@/features/marketing/pricing-section";
import { SiteFooter } from "@/features/marketing/site-footer";
import { SiteHeader } from "@/features/marketing/site-header";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "QuizGuard (quizkh) is free to use right now — create quizzes, run live quiz games, and monitor exams at no cost. Paid plans may come later.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user} />
      <main className="flex-1">
        <PricingSection user={user} />
      </main>
      <SiteFooter />
    </>
  );
}
