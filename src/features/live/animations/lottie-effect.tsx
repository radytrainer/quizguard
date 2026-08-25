"use client";

import { CheckCircle2, Trophy, XCircle, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { Lottie } from "lottie-react";

export type LottieEffectKind = "correct" | "wrong" | "trophy";

const FALLBACK_ICON: Record<LottieEffectKind, LucideIcon> = {
  correct: CheckCircle2,
  wrong: XCircle,
  trophy: Trophy,
};

const FALLBACK_COLOR: Record<LottieEffectKind, string> = {
  correct: "text-success",
  wrong: "text-destructive",
  trophy: "text-primary",
};

/** This project has no `.json` Lottie exports yet — rather than block on that, this component
 * is the integration point: pass a real `src` (an imported/fetched JSON object, or a URL —
 * `lottie-react`'s own `src` prop accepts either) once one exists and it renders through
 * `lottie-react` unchanged; every call site today omits it and gets the built-in Motion-based
 * icon burst below instead, which reads as the same kind of "correct/wrong/trophy" beat without
 * needing an asset. */
export function LottieEffect({
  kind,
  src,
  loop = false,
  size = 72,
  className,
}: {
  kind: LottieEffectKind;
  src?: string | object;
  loop?: boolean;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <Lottie
        src={src}
        loop={loop}
        autoplay
        style={{ width: size, height: size }}
        className={className}
      />
    );
  }

  const Icon = FALLBACK_ICON[kind];
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className={className}
      style={{ width: size, height: size }}
    >
      <Icon
        className={FALLBACK_COLOR[kind]}
        style={{ width: size, height: size }}
      />
    </motion.div>
  );
}
