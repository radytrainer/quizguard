"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Shared by both the Motion-driven pieces here (which could use Motion's own
 * `useReducedMotion` instead) and the GSAP-driven ones (which have no such hook of their own) —
 * one source of truth so every animation in this feature respects the same setting.
 * `useSyncExternalStore` (not `useState`+`useEffect`) is the correct tool for "read a live
 * browser value and re-render on change" — it needs no separate effect to sync an initial read
 * into state, which is what a lint pass here flagged as a synchronous setState-in-effect. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
