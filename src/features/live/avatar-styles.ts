import {
  Bird,
  Cat,
  Dog,
  Fish,
  Panda,
  Rabbit,
  Squirrel,
  Turtle,
  type LucideIcon,
} from "lucide-react";

import type { LiveAvatar } from "@/backend/live/live.schema";

export const AVATAR_ICONS: Record<LiveAvatar, LucideIcon> = {
  cat: Cat,
  dog: Dog,
  rabbit: Rabbit,
  turtle: Turtle,
  bird: Bird,
  fish: Fish,
  panda: Panda,
  squirrel: Squirrel,
};

export const AVATAR_LABELS: Record<LiveAvatar, string> = {
  cat: "Cat",
  dog: "Dog",
  rabbit: "Rabbit",
  turtle: "Turtle",
  bird: "Bird",
  fish: "Fish",
  panda: "Panda",
  squirrel: "Squirrel",
};

const AVATAR_BADGE_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-pink-500",
] as const;

/** Deterministic from `participantId`, not `Math.random()` — the host's roster/leaderboard and
 * the player's own device render this independently, with no color ever sent over the wire, so
 * the pick has to be reproducible from an id both sides already have (same reasoning as
 * option-styles.ts's `getLiveOptionStyle`). */
export function getAvatarBadgeColor(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) {
    hash = (hash * 31 + participantId.charCodeAt(i)) | 0;
  }
  return AVATAR_BADGE_COLORS[Math.abs(hash) % AVATAR_BADGE_COLORS.length];
}
