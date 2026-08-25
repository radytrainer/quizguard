import type { Transition, Variants } from "motion/react";

// Every duration here targets the ranges the animation spec called out (question entrance
// ~300-600ms, wrong-answer shake ~200-400ms, question transitions ~300-700ms) — fast enough to
// never feel like it's slowing gameplay down, per the "keep it fast" rule throughout.

export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 28,
};

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
};

/** The question card itself — a slight scale/fade entrance, and a quick fade/lift exit so one
 * question doesn't visually collide with the next during a fast between-questions swap. */
export const questionCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -6,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Wraps the options list — `staggerChildren` is what makes each option pop in one after
 * another instead of all at once. */
export const optionListVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

export const optionItemVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_SNAPPY,
  },
};

/** Applied to a selected answer — a quick "settle" pulse (scale 0.97 -> 1, per the spec's own
 * example) rather than a full re-mount, so it reads as confirmation, not a layout change. */
export const answerSelectedVariants: Variants = {
  initial: { scale: 1 },
  selected: {
    scale: [1, 0.97, 1.02, 1],
    transition: { duration: 0.32, ease: "easeInOut" },
  },
};

/** A short, restrained shake — horizontal only, decaying amplitude, ~300ms total (spec: 200-
 * 400ms) — for a wrong answer. Never used on a loop; always a one-shot `animate` on mount. */
export const wrongShakeVariants: Variants = {
  initial: { x: 0 },
  shake: {
    x: [0, -8, 7, -5, 3, 0],
    transition: { duration: 0.32, ease: "easeInOut" },
  },
};

/** A one-shot emphasis pop for the correct answer during reveal. */
export const correctPopVariants: Variants = {
  initial: { scale: 1 },
  pop: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

/** Player/roster cards joining or leaving the lobby list — `layout` (set on the element itself,
 * not here) handles everyone else sliding over to fill the gap. */
export const rosterItemVariants: Variants = {
  initial: { opacity: 0, scale: 0.85, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_SOFT },
  exit: {
    opacity: 0,
    scale: 0.85,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

/** Full-screen overlays (quiz-start sequence, celebration flourishes) — plain fade, deliberately
 * simple since the content inside carries its own motion. */
export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};
