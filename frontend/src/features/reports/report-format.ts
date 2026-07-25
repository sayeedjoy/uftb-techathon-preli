import {
  CheckCircle2,
  Clock,
  Droplets,
  Flame,
  Users,
  Wind,
  XCircle,
} from "lucide-react"
import type { HazardType, ReportStatus } from "@scsrg/shared"

/**
 * The vocabulary the report views share.
 *
 * Both surfaces that render a report — the chat reply and the review list —
 * read hazard, status and severity from here, so a gas report looks like a gas
 * report in both places and a palette change stays one edit.
 */

export const HAZARD_PRESENTATION = {
  FIRE: { label: "fire", Icon: Flame, fill: "bg-hazard-fire" },
  GAS: { label: "gas", Icon: Wind, fill: "bg-hazard-gas" },
  WATER: { label: "water", Icon: Droplets, fill: "bg-hazard-water" },
  OCCUPANCY: { label: "occupancy", Icon: Users, fill: "bg-hazard-occupancy" },
} as const satisfies Record<
  HazardType,
  { label: string; Icon: typeof Flame; fill: string }
>

/**
 * Status is never carried by colour alone — every pill pairs its tint with an
 * icon and the word itself, so a colour-blind operator reads the same thing.
 */
export const STATUS_PRESENTATION = {
  PENDING: {
    label: "Pending",
    Icon: Clock,
    className: "border-warning-border bg-warning-surface text-warning",
  },
  CONFIRMED: {
    label: "Approved",
    Icon: CheckCircle2,
    className: "border-safe-border bg-safe-surface text-safe",
  },
  REJECTED: {
    label: "Rejected",
    Icon: XCircle,
    className: "border-offline-border bg-offline-surface text-offline",
  },
} as const satisfies Record<
  ReportStatus,
  { label: string; Icon: typeof Clock; className: string }
>

/** Severity 1–5, coloured the way the rest of the app colours state. */
export const SEVERITY_FILL = [
  "bg-safe",
  "bg-safe",
  "bg-warning",
  "bg-critical",
  "bg-critical",
] as const

export function relativeTime(iso: string): string {
  const deltaMs = Date.now() - Date.parse(iso)
  if (!Number.isFinite(deltaMs)) return "unknown"
  if (deltaMs < 60_000) return "just now"
  if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)}m ago`
  if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3_600_000)}h ago`
  return `${Math.floor(deltaMs / 86_400_000)}d ago`
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString([], { hour12: false })
}
