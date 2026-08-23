"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import type { LiveLeaderboardEntry } from "@/backend/live/live.schema";

// Springs toward a new score instead of snapping to it — Kahoot's own leaderboard does the
// same, and it's what makes a score change between questions read as *movement* rather than a
// flicker. `useSpring`/`useTransform` only drive a motion value, which doesn't itself trigger a
// React re-render, so the `.on("change", ...)` subscription is what actually updates the
// rendered digits each animation frame.
function AnimatedScore({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 20 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => rounded.on("change", setDisplay), [rounded]);

  return <span className="font-mono font-semibold">{display}</span>;
}

/** Shared by the host's between-questions leaderboard and each player's own (top-5) view — the
 * `layout` prop on each row is what animates the reorder: React reconciles by `participantId`,
 * and any row whose position changed between one `live:leaderboard` broadcast and the next
 * slides there instead of snapping, the same as Kahoot's own leaderboard. */
export function AnimatedLeaderboardList({
  entries,
}: {
  entries: LiveLeaderboardEntry[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <motion.div
          key={entry.participantId}
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="border-border bg-card flex items-center justify-between rounded-lg border p-3"
        >
          <span className="flex items-center gap-3">
            <span className="text-muted-foreground w-6 font-mono">
              #{entry.rank}
            </span>
            <span className="font-medium">{entry.name}</span>
          </span>
          <AnimatedScore value={entry.score} />
        </motion.div>
      ))}
    </div>
  );
}
