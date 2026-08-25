"use client";

import { LIVE_AVATARS, type LiveAvatar } from "@/backend/live/live.schema";
import {
  AVATAR_ICONS,
  AVATAR_LABELS,
  getAvatarBadgeColor,
} from "@/features/live/avatar-styles";
import { cn } from "@/lib/utils";

/** A grid of animal picks for the guest "what's your name" step (features/live/guest-live-entry
 * .tsx) — the badge color is keyed off the avatar name here (not a participant id, which
 * doesn't exist until the join actually succeeds), purely so each option in the picker itself
 * looks visually distinct; the roster/leaderboard badge elsewhere uses the real participantId. */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: LiveAvatar;
  onChange: (avatar: LiveAvatar) => void;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-2"
      role="radiogroup"
      aria-label="Choose your avatar"
    >
      {LIVE_AVATARS.map((avatar) => {
        const Icon = AVATAR_ICONS[avatar];
        const selected = avatar === value;
        return (
          <button
            key={avatar}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={AVATAR_LABELS[avatar]}
            onClick={() => onChange(avatar)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-white",
                getAvatarBadgeColor(avatar),
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="text-muted-foreground text-[11px]">
              {AVATAR_LABELS[avatar]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
