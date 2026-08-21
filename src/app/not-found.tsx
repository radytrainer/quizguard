import Link from "next/link";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";

export default async function NotFound() {
  // Forces dynamic rendering — Next's own default /_not-found page is statically prerendered,
  // which has no per-request nonce to attach to the hydration script under proxy.ts's
  // nonce-based CSP (Phase 13, docs/ARCHITECTURE.md — Section 16). Overriding it with this file
  // is the only way to opt it into dynamic rendering.
  await connection();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </main>
  );
}
