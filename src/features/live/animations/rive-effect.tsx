"use client";

import type { ReactNode } from "react";
import { useRive } from "@rive-app/react-canvas";

/** No `.riv` files exist in this project yet, and this component is currently **not imported by
 * live-player-view.tsx/live-host-view.tsx** — they render `LottieEffect` directly instead. It
 * was wired in briefly via `next/dynamic({ ssr: false })` plus a warm-up `import()` fired the
 * moment a student's own page mounted, and that warm-up call is the prime suspect behind a real
 * "this page couldn't load" crash reported on student devices right at join time — pulling in
 * `@rive-app/canvas`'s WASM payload that eagerly, on a page that has to work on whatever phone a
 * student scans a QR code with, was too big a risk for a feature with no actual asset behind it
 * yet. Left in place, unreferenced, as the wiring for whenever a real `.riv` file exists: pass
 * `src` (and whichever `stateMachines`/`artboard` name it defines) and this renders the real
 * interactive animation, with `fallback` (a `LottieEffect`) for everything before that. Re-wire
 * it the same lazy/client-only way if you do — just without a mount-time prefetch on the
 * student-facing path; prefetch it from the host's view only, or not at all, and measure real
 * device impact before trusting the tradeoff again. `useRive` itself has to be called
 * unconditionally either way (Rules of Hooks) — passing it an `undefined` src is the library's
 * own supported "nothing to load yet" state, not a workaround. */
export function RiveEffect({
  src,
  stateMachines,
  artboard,
  autoplay = true,
  className,
  fallback = null,
}: {
  src?: string;
  stateMachines?: string;
  artboard?: string;
  autoplay?: boolean;
  className?: string;
  fallback?: ReactNode;
}) {
  const { RiveComponent } = useRive({
    src,
    stateMachines,
    artboard,
    autoplay,
  });

  if (!src) return <>{fallback}</>;
  return <RiveComponent className={className} />;
}
