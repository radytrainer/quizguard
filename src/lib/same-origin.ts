import type { NextRequest } from "next/server";

/**
 * Baseline CSRF defense for cookie-authenticated state-changing routes: reject cross-origin
 * requests outright (an attacker's page can trigger a request but not read/spoof this header).
 * Combined with the session cookie's `SameSite=Lax`, this covers the realistic browser attack
 * surface without a double-submit token — see docs/ARCHITECTURE.md — Auth & CSRF.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Same-origin requests from fetch()/forms always send Origin for state-changing methods in
  // modern browsers; absence of both headers means a non-browser client, which this check
  // intentionally doesn't try to authenticate (that's the session/API-key layer's job).
  if (!origin) return true;

  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
