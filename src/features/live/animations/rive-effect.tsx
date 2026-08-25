"use client";

import type { ReactNode } from "react";
import { useRive } from "@rive-app/react-canvas";

/** No `.riv` files exist in this project yet — this is the wiring so one can be dropped in
 * later (e.g. `public/rive/correct-reaction.riv`) without touching any call site: pass `src`
 * (and, once a real file exists, whichever `stateMachines`/`artboard` name it defines) and this
 * renders the real interactive animation; every call site today omits `src` entirely and gets
 * `fallback` instead (this feature always passes a `LottieEffect` for that — see
 * correct/wrong/trophy usage in live-player-view.tsx and live-host-view.tsx).
 *
 * `useRive` itself has to be called unconditionally either way (Rules of Hooks) — passing it an
 * `undefined` src is the library's own supported "nothing to load yet" state, not a workaround. */
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
