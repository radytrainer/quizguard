"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

import { usePrefersReducedMotion } from "@/features/live/animations/use-reduced-motion";

const BEATS = ["Get Ready", "3", "2", "1", "Go!"];
const BEAT_SECONDS = 0.55;

/** A short "GET READY / 3 / 2 / 1 / GO!" overlay, purely decorative — it renders *on top of*
 * the real first question, which mounts (and starts its real, server-timed countdown)
 * immediately and unaffected underneath. This never gates or delays anything about when the
 * question/timer actually becomes interactive (the rule this whole feature has to respect);
 * it's a ~2.75s flourish that fades itself out via GSAP's own timeline, not a loading gate. */
export function QuizStartSequence({ onDone }: { onDone: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const beatRef = useRef<HTMLDivElement>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const doneRef = useRef(onDone);

  // Keeps `doneRef` current without calling it a dependency of the timeline effect below —
  // that effect must only ever run once per mount (a `reducedMotion` change aside), not
  // re-build the whole GSAP timeline just because the parent passed a new function identity.
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (reducedMotion) {
      // A shorter, static fallback — still gives the moment its own beat, without the
      // scale/rotation motion prefers-reduced-motion asks to avoid.
      const timeout = setTimeout(() => doneRef.current(), 700);
      return () => clearTimeout(timeout);
    }

    const timeline = gsap.timeline({
      onComplete: () => doneRef.current(),
    });

    for (let i = 0; i < BEATS.length; i++) {
      timeline.call(() => setBeatIndex(i), undefined, i * BEAT_SECONDS);
      if (beatRef.current) {
        timeline.fromTo(
          beatRef.current,
          { scale: 0.5, opacity: 0, rotate: -6 },
          {
            scale: 1,
            opacity: 1,
            rotate: 0,
            duration: BEAT_SECONDS * 0.5,
            ease: "back.out(2.5)",
          },
          i * BEAT_SECONDS,
        );
        timeline.to(
          beatRef.current,
          { opacity: 0, scale: 1.15, duration: BEAT_SECONDS * 0.35 },
          i * BEAT_SECONDS + BEAT_SECONDS * 0.6,
        );
      }
    }
    timeline.to(containerRef.current, { opacity: 0, duration: 0.2 });

    return () => {
      timeline.kill();
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="bg-background/90 pointer-events-none fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
    >
      <div
        ref={beatRef}
        className="text-primary text-5xl font-black tracking-tight sm:text-6xl"
      >
        {BEATS[beatIndex]}
      </div>
    </div>
  );
}
