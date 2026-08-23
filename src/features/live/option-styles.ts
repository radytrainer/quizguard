import {
  Bird,
  Bug,
  Cat,
  Dog,
  Egg,
  Feather,
  Fish,
  Flower,
  Flower2,
  Leaf,
  Mouse,
  Panda,
  PawPrint,
  Rabbit,
  Shell,
  Snail,
  Squirrel,
  Turtle,
  Worm,
  type LucideIcon,
} from "lucide-react";

// Colors stay fixed per position — a "red" answer has to mean the same option on the host's
// cast screen and every player's own phone. Only the icon rotates.
const OPTION_COLORS = [
  "bg-red-500 text-white",
  "bg-blue-500 text-white",
  "bg-yellow-400 text-black",
  "bg-green-500 text-white",
] as const;

// Each group is themed (a little visual variety beyond the same four shapes every round) and
// exactly OPTION_COLORS.length long, one icon per color/position. lucide-react has no
// snake/lion/cow/crab in this version, so those examples became the closest animal it does
// have (worm, panda, dog, shell).
const ICON_GROUPS: readonly LucideIcon[][] = [
  [Flower, Rabbit, Fish, Turtle],
  [Dog, Bird, Shell, Fish],
  [Mouse, Worm, Flower2, Panda],
  [Squirrel, Bug, Leaf, Egg],
  [Cat, Snail, PawPrint, Feather],
];

export interface LiveOptionStyle {
  Icon: LucideIcon;
  className: string;
}

/** Picked from `questionIndex`, not `Math.random()` — the host's cast screen and every player's
 * device render this completely independently, with no shape data ever sent over the wire, so
 * the pick has to be deterministic or the room would disagree on what "the blue one" looks
 * like for the same question. */
export function getLiveOptionStyle(
  questionIndex: number,
  position: number,
): LiveOptionStyle {
  const group = ICON_GROUPS[questionIndex % ICON_GROUPS.length];
  return {
    Icon: group[position % group.length],
    className: OPTION_COLORS[position % OPTION_COLORS.length],
  };
}
