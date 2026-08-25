"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/** Wraps just the countdown number — never the timer logic itself, which stays exactly what it
 * was (the parent still computes `seconds` from the server's own `startedAt`/`timeLimitSeconds`
 * every tick; this only decides how to *present* whatever value it's handed). Mirrors the
 * color-threshold precedent features/attempts/exam-attempt.tsx already established for its own
 * countdown, rather than inventing a new one, and adds a `key`-triggered pulse per second once
 * time is running low so it reads as "hurry" without changing the number's own layout. */
export function CountdownEmphasis({
  seconds,
  children,
  className,
}: {
  seconds: number;
  children: ReactNode;
  className?: string;
}) {
  const urgency =
    seconds <= 3 ? "critical" : seconds <= 5 ? "warning" : "normal";

  return (
    <motion.span
      key={urgency === "normal" ? "normal" : seconds}
      className={cn(
        urgency === "critical" && "text-destructive",
        urgency === "warning" && "text-warning",
        className,
      )}
      animate={
        urgency === "critical"
          ? { scale: [1, 1.22, 1] }
          : urgency === "warning"
            ? { scale: [1, 1.08, 1] }
            : { scale: 1 }
      }
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.span>
  );
}
