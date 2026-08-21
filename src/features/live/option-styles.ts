// Fixed shape/color per option position, shared by the host and player views — a "blue diamond"
// has to mean the same answer on every screen in the room, so this can't vary per component.
export const LIVE_OPTION_STYLES = [
  { shape: "▲", className: "bg-red-500 text-white" },
  { shape: "◆", className: "bg-blue-500 text-white" },
  { shape: "●", className: "bg-yellow-400 text-black" },
  { shape: "■", className: "bg-green-500 text-white" },
] as const;
