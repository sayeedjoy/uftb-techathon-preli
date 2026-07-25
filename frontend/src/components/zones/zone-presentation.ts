import type { ZoneState } from "@scsrg/shared"

/** Border treatment per state — weight and style carry meaning, not just hue. */
export function stateBorderClass(state: ZoneState): string {
  switch (state) {
    case "CRITICAL":
      return "border-red-500/60"
    case "WARNING":
      return "border-amber-500/50"
    case "OFFLINE":
      return "border-zinc-600/60 border-dashed"
    default:
      return "border-emerald-700/30"
  }
}

/** Sort order for the grid: the most urgent zones come first. */
export const STATE_SORT_ORDER: Record<ZoneState, number> = {
  CRITICAL: 0,
  WARNING: 1,
  OFFLINE: 2,
  SAFE: 3,
}
