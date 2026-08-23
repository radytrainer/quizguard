import { NextResponse, type NextRequest } from "next/server";

// Must match SESSION_COOKIE_NAME in backend/auth/session.ts. Duplicated (not imported) on
// purpose: session.ts pulls in Redis and next/headers, which this file deliberately avoids —
// per the Next.js authentication guide, Proxy should only do a cheap optimistic check (cookie
// presence), never a database/Redis round trip, since it runs on every request including
// prefetches. The authoritative check happens in the DAL (backend/auth/rbac.ts) on every page
// and route handler regardless of what Proxy decides.
const SESSION_COOKIE_NAME = "qg_session";

const roleRoutes = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
} as const;

const protectedPrefixes = Object.values(roleRoutes);

const isDev = process.env.NODE_ENV === "development";
// Unset in production (Section 16, same reasoning as features/realtime/socket-client.ts): the
// realtime connection is same-origin through Nginx there, and `connect-src 'self'` already
// covers that — no extra allow-list entry needed, and none is baked in at build time.
const realtimeOrigin = process.env.NEXT_PUBLIC_REALTIME_URL ?? "";
// The actual handshake is a WebSocket upgrade (`ws://`), not a plain HTTP request — an
// `http://` connect-src source does NOT implicitly permit the equivalent `ws://` scheme (that's
// a common assumption, but browsers enforce scheme separately), so both forms need to be listed
// or every socket.io connection gets silently blocked.
const realtimeWsOrigin = realtimeOrigin.replace(/^http/, "ws");

/**
 * Nonce-based CSP (Phase 13, docs/ARCHITECTURE.md — Section 16), replacing Phase 11's static
 * `next.config.ts` policy now that Nginx exists in front of this app to interact with
 * correctly (the thing Phase 11 was waiting on — a nonce must never be cached/reused across
 * requests, and Nginx doesn't cache these dynamic responses). A fresh nonce is generated per
 * request and set on both the outgoing request headers (so Server Components can read it via
 * `headers()`, matching `node_modules/next/dist/docs/01-app/02-guides/content-security-policy
 * .md`'s own pattern) and the response header Next parses to auto-attach the nonce to its own
 * framework/hydration `<script>` tags.
 *
 * `style-src`/`style-src-attr` still need `'unsafe-inline'` regardless of nonces — nonces only
 * cover `<script>`/`<style>`/`<link>` elements, never the `style="..."` HTML attribute Radix
 * UI's positioning primitives (Select, Popover, Dialog) set at runtime, so this part of Phase
 * 11's original trade-off is unchanged. What nonces actually harden is `script-src`: dropping
 * `'unsafe-inline'` there in favor of `'nonce-<value>' 'strict-dynamic'` means an attacker who
 * finds an HTML injection point still can't get an arbitrary inline `<script>` to execute,
 * since they can't guess the per-request nonce.
 */
function buildCspHeader(nonce: string): string {
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    connect-src 'self'${realtimeOrigin ? ` ${realtimeOrigin} ${realtimeWsOrigin}` : ""};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    // Optimistic only: we don't know the role from the cookie alone, so send them to a
    // neutral page that resolves the correct destination with an authoritative check.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
