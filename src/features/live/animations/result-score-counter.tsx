"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";

import { usePrefersReducedMotion } from "@/features/live/animations/use-reduced-motion";

/** The hero score reveal on a results screen — ticks up from 0 to `value` once, via a GSAP
 * tween on a plain object (not the DOM directly), reading the live number back out on every
 * frame into React state. Distinct from animated-leaderboard.tsx's `AnimatedScore` (a Motion
 * spring that *tracks* a value as it changes turn-by-turn in a list); this is a single
 * count-up-and-stop moment, which is what the spec calls out GSAP for specifically ("score
 * counter" alongside countdown/celebration timelines). */
export function ResultScoreCounter({
  value,
  durationSeconds = 1.4,
  className,
}: {
  value: number;
  durationSeconds?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Nothing to tween — the render below shows `value` directly in this case.
    if (reducedMotion) return;
    const proxy = { n: 0 };
    const tween = gsap.to(proxy, {
      n: value,
      duration: durationSeconds,
      ease: "power2.out",
      onUpdate: () => setDisplay(Math.round(proxy.n)),
    });
    return () => {
      tween.kill();
    };
  }, [value, durationSeconds, reducedMotion]);

  return <span className={className}>{reducedMotion ? value : display}</span>;
}
