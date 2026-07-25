import { AlertTriangle, CheckCircle2, HelpCircle, Siren } from "lucide-react"
import type { ZoneState } from "@scsrg/shared"

/**
 * The single source of truth for how a zone state looks.
 *
 * Everything here resolves to semantic tokens (`--critical`, `--warning`, …)
 * defined once in `index.css` for both themes. No component reaches for a raw
 * Tailwind scale like `red-300`: those are dark-only by construction, and a
 * dashboard whose alarm colour is illegible in light mode is a safety defect,
 * not a cosmetic one.
 *
 * `satisfies Record<ZoneState, …>` is deliberate: adding a fifth zone state
 * must break the build here rather than silently render nothing.
 */
export const ZONE_STATE_PRESENTATION = {
  SAFE: {
    label: "Safe",
    Icon: CheckCircle2,
    /** Icon and text colour on the page background. */
    text: "text-safe",
    /** Tinted fill for badges and panels. */
    surface: "bg-safe-surface",
    border: "border-safe-border",
    /** Card edge — weight and style carry meaning, not hue alone. */
    cardBorder: "border-safe-border/70",
    /** Fill for meters and bars. */
    meter: "bg-safe",
  },
  WARNING: {
    label: "Warning",
    Icon: AlertTriangle,
    text: "text-warning",
    surface: "bg-warning-surface",
    border: "border-warning-border",
    cardBorder: "border-warning-border",
    meter: "bg-warning",
  },
  CRITICAL: {
    label: "Critical",
    Icon: Siren,
    text: "text-critical",
    surface: "bg-critical-surface",
    border: "border-critical-border",
    cardBorder: "border-critical-border",
    meter: "bg-critical-solid",
  },
  OFFLINE: {
    label: "Offline",
    Icon: HelpCircle,
    text: "text-offline",
    surface: "bg-offline-surface",
    border: "border-offline-border",
    // Dashed edge so "we don't know" is distinguishable from "we know it's
    // fine" without relying on colour — including in greyscale.
    cardBorder: "border-offline-border border-dashed",
    meter: "bg-offline",
  },
} as const satisfies Record<
  ZoneState,
  {
    label: string
    Icon: typeof Siren
    text: string
    surface: string
    border: string
    cardBorder: string
    meter: string
  }
>

/** Border treatment per state — weight and style carry meaning, not just hue. */
export function stateBorderClass(state: ZoneState): string {
  return ZONE_STATE_PRESENTATION[state].cardBorder
}

/** Sort order for the grid: the most urgent zones come first. */
export const STATE_SORT_ORDER: Record<ZoneState, number> = {
  CRITICAL: 0,
  WARNING: 1,
  OFFLINE: 2,
  SAFE: 3,
}
