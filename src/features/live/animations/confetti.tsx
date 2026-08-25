"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import { usePrefersReducedMotion } from "@/features/live/animations/use-reduced-motion";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

const PARTICLE_COUNT = 36;

/** A one-shot DOM+GSAP particle burst — deliberately not `canvas-confetti` or another package:
 * a few dozen absolutely-positioned divs animated with `transform`/`opacity` only (never
 * `top`/`left`, so this never triggers layout) is plenty for a single browser's own celebration
 * moment and keeps this feature's new dependencies to gsap/lottie-react/@rive-app/react-canvas,
 * nothing confetti-specific. Every particle's tween is tracked on one `gsap.timeline()` so a
 * re-trigger (or unmount) mid-burst can `.kill()` everything at once rather than leaking
 * dangling tweens — see the cleanup in the effect below. */
export function ConfettiBurst({ trigger }: { trigger: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (trigger === 0 || reducedMotion) return;
    const container = containerRef.current;
    if (!container) return;

    const timeline = gsap.timeline({
      onComplete: () => {
        container.replaceChildren();
      },
    });

    const { innerWidth, innerHeight } = window;
    const originX = innerWidth / 2;
    const originY = innerHeight * 0.35;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = document.createElement("span");
      const size = 6 + Math.random() * 6;
      particle.style.position = "absolute";
      particle.style.left = `${originX}px`;
      particle.style.top = `${originY}px`;
      particle.style.width = `${size}px`;
      particle.style.height = `${size * (Math.random() > 0.5 ? 1 : 2.2)}px`;
      particle.style.background =
        COLORS[Math.floor(Math.random() * COLORS.length)];
      particle.style.borderRadius = Math.random() > 0.5 ? "9999px" : "2px";
      particle.style.willChange = "transform, opacity";
      container.appendChild(particle);

      const angle = (Math.random() * Math.PI - Math.PI / 2) * 1.4 - Math.PI / 2;
      const distance = 140 + Math.random() * 220;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance + 120; // gravity drift downward

      timeline.fromTo(
        particle,
        { x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 },
        {
          x: dx,
          y: dy,
          opacity: 0,
          rotate: (Math.random() - 0.5) * 720,
          scale: 0.6,
          duration: 0.9 + Math.random() * 0.5,
          ease: "power2.out",
        },
        0,
      );
    }

    return () => {
      timeline.kill();
      container.replaceChildren();
    };
  }, [trigger, reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    />
  );
}
