import { getCurrentUser } from "@/backend/auth/session";
import { PricingSection } from "@/features/marketing/pricing-section";
import { SiteFooter } from "@/features/marketing/site-footer";
import { SiteHeader } from "@/features/marketing/site-header";

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
