import { Bell, BellOff, Lightbulb, Power, PowerOff } from "lucide-react"
import type { ActuatorStateDto, LedColor } from "@scsrg/shared"

import { cn } from "@/lib/utils"

const LED_PRESENTATION = {
  GREEN: { label: "LED green", className: "text-safe" },
  YELLOW: { label: "LED yellow", className: "text-warning" },
  RED: { label: "LED red", className: "text-critical" },
  AMBER_PULSE: {
    label: "LED amber (pulsing)",
    className: "text-warning animate-alert",
  },
} as const satisfies Record<LedColor, { label: string; className: string }>

function Chip({
  Icon,
  label,
  active,
  className,
}: {
  Icon: typeof Bell
  label: string
  active: boolean
  className?: string
}) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
        active
          ? "border-critical-border bg-critical-surface text-critical"
          : "border-border/60 bg-muted/30 text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  )
}

/**
 * The simulated LED, buzzer and relay for one zone.
 *
 * Each element carries its own text label rather than relying on the colour of
 * a dot, so the picture is legible in greyscale and to a screen reader.
 */
export function ActuatorStrip({
  actuators,
  className,
}: {
  actuators: ActuatorStateDto
  className?: string
}) {
  const led = LED_PRESENTATION[actuators.led]

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        title={led.label}
        className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
      >
        <Lightbulb aria-hidden className={cn("size-3", led.className)} />
        {actuators.led.replace("_", " ").toLowerCase()}
      </span>

      <Chip
        Icon={actuators.buzzerActive ? Bell : BellOff}
        label={actuators.buzzerActive ? "Buzzer on" : "Buzzer off"}
        active={actuators.buzzerActive}
      />
      <Chip
        Icon={actuators.relayCutoffActive ? PowerOff : Power}
        label={actuators.relayCutoffActive ? "Relay cut" : "Relay closed"}
        active={actuators.relayCutoffActive}
      />
    </div>
  )
}
