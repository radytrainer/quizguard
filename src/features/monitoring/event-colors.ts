import type { ViolationType } from "@/database/schema";

// Shared between live-monitor.tsx's activity feed and student-story-dialog.tsx's timeline so
// the same event always reads the same color in both places — fullscreen exits are a lower-
// severity signal (a student might legitimately alt-tab briefly), tab switches and clipboard
// use are treated as more deliberate and colored accordingly.
export const VIOLATION_BADGE_CLASSNAME: Record<ViolationType, string> = {
  fullscreen_exit: "border-warning/30 bg-warning/10 text-warning",
  tab_switch: "border-destructive/30 bg-destructive/10 text-destructive",
  copy_paste: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const STARTED_BADGE_CLASSNAME =
  "border-success/30 bg-success/10 text-success";

export const NEUTRAL_BADGE_CLASSNAME =
  "border-outline-variant bg-muted text-muted-foreground";

// A locked attempt (fullscreen exit on a quiz that requires it) and the teacher unlocking it
// share the same destructive/success pairing as a violation's outcome, for the same reason —
// locking is the most severe monitoring state, unlocking is a deliberate corrective action.
export const LOCKED_BADGE_CLASSNAME =
  "border-destructive/30 bg-destructive/10 text-destructive";

export function outcomeBadgeClassName(passed: boolean | null): string {
  if (passed === null) return NEUTRAL_BADGE_CLASSNAME;
  return passed
    ? "border-success/30 bg-success/10 text-success"
    : "border-destructive/30 bg-destructive/10 text-destructive";
}
