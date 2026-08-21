import { getCurrentUser } from "@/backend/auth/session";
import { FeaturesSection } from "@/features/marketing/features-section";
import { HeroSection } from "@/features/marketing/hero-section";
import { SiteFooter } from "@/features/marketing/site-footer";
import { SiteHeader } from "@/features/marketing/site-header";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user} />
      <main className="flex-1">
        <HeroSection user={user} />
        <FeaturesSection />
      </main>
      <SiteFooter />
    </>
  );
}
