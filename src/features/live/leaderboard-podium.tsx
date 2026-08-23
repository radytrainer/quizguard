"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Crown, Medal } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LiveLeaderboardEntry } from "@/backend/live/live.schema";

// Hardcoded regardless of light/dark theme, same reasoning as option-styles.ts's answer
// colors — a gold medal has to read as gold, not as whatever the current theme remaps
// "primary" to.
const PODIUM_STYLES: Record<
  number,
  { block: string; step: string; delay: number }
> = {
  1: {
    block: "bg-yellow-400 text-yellow-950 border-yellow-500",
    step: "h-28",
    delay: 0.15,
  },
  2: {
    block: "bg-slate-300 text-slate-900 border-slate-400",
    step: "h-20",
    delay: 0,
  },
  3: {
    block: "bg-amber-600 text-amber-50 border-amber-700",
    step: "h-16",
    delay: 0.3,
  },
};

// Left-to-right podium order (silver, gold, bronze), not rank order — the visual convention a
// real awards podium uses, with gold in the middle and tallest.
const PODIUM_ORDER = [2, 1, 3];

/** The end-of-game screen (host and player share this) — a 1/2/3 podium for the medals, with
 * everyone else tucked behind a "View all ranks" toggle so the podium stays the focal point
 * instead of a wall of rows. */
export function LeaderboardPodium({
  standings,
}: {
  standings: LiveLeaderboardEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const byRank = new Map(
    standings.filter((entry) => entry.rank <= 3).map((e) => [e.rank, e]),
  );
  const rest = standings.filter((entry) => entry.rank > 3);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-end justify-center gap-3">
        {PODIUM_ORDER.map((rank) => {
          const entry = byRank.get(rank);
          if (!entry) return null;
          const style = PODIUM_STYLES[rank];
          return (
            <motion.div
              key={entry.participantId}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: style.delay,
                type: "spring",
                stiffness: 200,
              }}
              className="flex w-24 flex-col items-center gap-2"
            >
              <p className="w-full truncate text-center text-sm font-semibold">
                {entry.name}
              </p>
              <div
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1 rounded-t-xl border-2 font-bold",
                  style.block,
                  style.step,
                )}
              >
                {rank === 1 ? (
                  <Crown className="size-5" />
                ) : (
                  <Medal className="size-5" />
                )}
                <span className="text-lg">#{rank}</span>
                <span className="font-mono text-sm">{entry.score}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-center"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "Hide full ranking"
              : `View all ranks (${standings.length})`}
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
          {expanded && (
            <div className="flex flex-col gap-2">
              {rest.map((entry) => (
                <div
                  key={entry.participantId}
                  className="border-border flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground w-6 font-mono">
                      #{entry.rank}
                    </span>
                    <span className="font-medium">{entry.name}</span>
                  </span>
                  <span className="font-mono font-semibold">{entry.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
