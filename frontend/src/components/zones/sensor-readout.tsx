import { Droplets, Flame, Users, Wind } from "lucide-react"
import type { SensorHealthDto, ZoneSensorValuesDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"

function statusOf(
  sensors: SensorHealthDto[],
  type: SensorHealthDto["type"]
): SensorHealthDto | undefined {
  return sensors.find((sensor) => sensor.type === type)
}

function Row({
  Icon,
  label,
  value,
  emphasis,
}: {
  Icon: typeof Flame
  label: string
  value: string
  emphasis?: "danger" | "warning" | "muted"
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <span
        data-numeric
        className={cn(
          "font-mono",
          emphasis === "danger" && "font-semibold text-critical",
          emphasis === "warning" && "text-warning",
          emphasis === "muted" && "text-offline italic"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Per-sensor readout.
 *
 * The rule that matters: an unavailable sensor renders as "Unavailable", never
 * as "Clear" or "Unoccupied". "Nobody is here" and "we don't know" are
 * different facts and the UI must not conflate them.
 */
export function SensorReadout({
  values,
  sensors,
  className,
}: {
  values: ZoneSensorValuesDto
  sensors: SensorHealthDto[]
  className?: string
}) {
  const flame = statusOf(sensors, "FLAME")
  const gas = statusOf(sensors, "GAS")
  const water = statusOf(sensors, "WATER")
  const occupancySensor = statusOf(sensors, "OCCUPANCY")

  const occupancyUnavailable =
    occupancySensor?.status === "UNAVAILABLE" ||
    occupancySensor?.status === "OFFLINE" ||
    values.occupancyDetected === null

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {flame && (
        <Row
          Icon={Flame}
          label="Fire"
          value={
            flame.status === "UNAVAILABLE" || flame.status === "OFFLINE"
              ? "Unavailable"
              : values.fireSignal === 1
                ? "Confirmed"
                : values.fireDetected
                  ? "Detected (debouncing)"
                  : "Clear"
          }
          emphasis={
            flame.status === "UNAVAILABLE" || flame.status === "OFFLINE"
              ? "muted"
              : values.fireSignal === 1
                ? "danger"
                : values.fireDetected
                  ? "warning"
                  : undefined
          }
        />
      )}

      {gas && (
        <Row
          Icon={Wind}
          label="Gas"
          value={
            gas.status === "WARMING_UP"
              ? "Warming up"
              : gas.status === "UNAVAILABLE" || gas.status === "OFFLINE"
                ? "Unavailable"
                : values.gasLevel === null
                  ? "No reading"
                  : `${Math.round(values.gasLevel * 100)}%`
          }
          emphasis={
            gas.status === "WARMING_UP" ||
            gas.status === "UNAVAILABLE" ||
            gas.status === "OFFLINE"
              ? "muted"
              : (values.gasLevel ?? 0) >= 0.6
                ? "warning"
                : undefined
          }
        />
      )}

      {water && (
        <Row
          Icon={Droplets}
          label="Water"
          value={
            water.status === "UNAVAILABLE" || water.status === "OFFLINE"
              ? "Unavailable"
              : values.waterLevel === null
                ? "No reading"
                : `${Math.round(values.waterLevel * 100)}%${
                    values.waterPhase
                      ? ` · ${values.waterPhase.toLowerCase()}`
                      : ""
                  }`
          }
          emphasis={
            water.status === "UNAVAILABLE" || water.status === "OFFLINE"
              ? "muted"
              : (values.waterLevel ?? 0) >= 0.6
                ? "warning"
                : undefined
          }
        />
      )}

      {occupancySensor && (
        <Row
          Icon={Users}
          label="Occupancy"
          value={
            occupancyUnavailable
              ? "Unavailable"
              : values.occupancyDetected
                ? "Occupied"
                : "Unoccupied"
          }
          emphasis={occupancyUnavailable ? "muted" : undefined}
        />
      )}
    </div>
  )
}
