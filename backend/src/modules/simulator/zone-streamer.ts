import type { SimulatorZoneStateDto } from "@scsrg/shared"

import { env } from "../../config/env.js"
import { logger } from "../../config/logger.js"
import { emitToAdmins } from "../../realtime/emitter.js"
import { zoneKeyFor } from "./zone-keys.js"

export type StreamerZone = {
  id: string
  code: string
  name: string
}

export type StreamerPatch = Partial<Omit<StreamerState, "disconnectedSensors">> & {
  disconnectedSensors?: readonly string[]
}

export type StreamerState = {
  fireDetected: boolean
  gasLevel: number
  waterLevel: number
  occupancyDetected: boolean
  disconnectedSensors: Set<string>
  networkDisconnected: boolean
  warmupMode: boolean
  intervalMs: number
}

/**
 * One simulated sensor node.
 *
 * It POSTs to the real ingestion endpoint over HTTP with a real zone API key —
 * it never writes to the database and never mutates dashboard state directly.
 * Everything the Simulator page shows arrives back through the normal
 * API/socket path, so what the demo proves is the actual pipeline.
 */
export class ZoneStreamer {
  private timer: NodeJS.Timeout | null = null
  private sequenceNumber = 0
  private sentCount = 0
  private acceptedCount = 0
  private rejectedCount = 0
  private lastStatusCode: number | null = null
  private readonly configuredSensors: Set<string>

  readonly state: StreamerState = {
    fireDetected: false,
    gasLevel: 0,
    waterLevel: 0,
    occupancyDetected: false,
    disconnectedSensors: new Set(),
    networkDisconnected: false,
    warmupMode: false,
    intervalMs: env.SIM_DEFAULT_INTERVAL_MS,
  }

  constructor(
    readonly zone: StreamerZone,
    configuredSensors: string[],
    startSequenceAt = 0
  ) {
    this.configuredSensors = new Set(configuredSensors)
    this.sequenceNumber = startSequenceAt
  }

  get running(): boolean {
    return this.timer !== null
  }

  get hasCredential(): boolean {
    return zoneKeyFor(this.zone.code) !== null
  }

  start(intervalMs?: number): void {
    if (intervalMs) this.state.intervalMs = intervalMs
    if (this.timer) this.stop()

    this.timer = setInterval(() => {
      void this.tick()
    }, this.state.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  patch(patch: StreamerPatch): void {
    if (patch.fireDetected !== undefined) {
      this.state.fireDetected = patch.fireDetected
    }
    if (patch.gasLevel !== undefined) this.state.gasLevel = patch.gasLevel
    if (patch.waterLevel !== undefined) this.state.waterLevel = patch.waterLevel
    if (patch.occupancyDetected !== undefined) {
      this.state.occupancyDetected = patch.occupancyDetected
    }
    if (patch.disconnectedSensors !== undefined) {
      this.state.disconnectedSensors = new Set(patch.disconnectedSensors)
    }
    if (patch.networkDisconnected !== undefined) {
      this.state.networkDisconnected = patch.networkDisconnected
    }
    if (patch.warmupMode !== undefined) this.state.warmupMode = patch.warmupMode
    if (patch.intervalMs !== undefined) {
      this.state.intervalMs = patch.intervalMs
      if (this.running) this.start(patch.intervalMs)
    }
  }

  /** Builds the raw payload for the zone's *configured* sensors only. */
  buildPayload(overrides: { sequenceNumber?: number; capturedAt?: string } = {}) {
    const sequenceNumber = overrides.sequenceNumber ?? ++this.sequenceNumber
    const sensors: Record<string, boolean | number | null> = {}

    if (this.configuredSensors.has("FLAME")) {
      sensors.fireDetected = this.state.disconnectedSensors.has("FLAME")
        ? false
        : this.state.fireDetected
    }
    if (this.configuredSensors.has("GAS") && !this.state.disconnectedSensors.has("GAS")) {
      sensors.gasLevel = this.state.gasLevel
    }
    if (
      this.configuredSensors.has("WATER") &&
      !this.state.disconnectedSensors.has("WATER")
    ) {
      sensors.waterLevel = this.state.waterLevel
    }
    if (this.configuredSensors.has("OCCUPANCY")) {
      // A disconnected occupancy sensor sends null — never `false`.
      sensors.occupancyDetected = this.state.disconnectedSensors.has("OCCUPANCY")
        ? null
        : this.state.occupancyDetected
    }

    return {
      readingId: `${this.zone.code}-${sequenceNumber}-${Date.now()}`,
      sequenceNumber,
      capturedAt: overrides.capturedAt ?? new Date().toISOString(),
      sensors,
    }
  }

  /** POSTs one reading. Returns the backend's verbatim status and body. */
  async send(
    payload: unknown
  ): Promise<{ statusCode: number; body: unknown; latencyMs: number }> {
    const apiKey = zoneKeyFor(this.zone.code)
    const url = `${env.SIM_INGESTION_BASE_URL}/ingestion/zones/${this.zone.id}/readings`
    const startedAt = Date.now()

    emitToAdmins("simulator:payload", {
      zoneId: this.zone.id,
      zoneCode: this.zone.code,
      payload,
      sentAt: new Date().toISOString(),
    })

    this.sentCount += 1

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-zone-api-key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
      })

      const body: unknown = await response.json().catch(() => null)
      const latencyMs = Date.now() - startedAt

      this.lastStatusCode = response.status
      if (response.ok) this.acceptedCount += 1
      else this.rejectedCount += 1

      // The simulator surfaces rejections verbatim; it never masks them.
      emitToAdmins("simulator:response", {
        zoneId: this.zone.id,
        zoneCode: this.zone.code,
        statusCode: response.status,
        body,
        receivedAt: new Date().toISOString(),
        latencyMs,
      })

      return { statusCode: response.status, body, latencyMs }
    } catch (error) {
      this.rejectedCount += 1
      this.lastStatusCode = 0
      logger.warn({ err: error, zone: this.zone.code }, "Simulator request failed")

      const body = { error: error instanceof Error ? error.message : "unknown" }
      emitToAdmins("simulator:response", {
        zoneId: this.zone.id,
        zoneCode: this.zone.code,
        statusCode: 0,
        body,
        receivedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      })
      return { statusCode: 0, body, latencyMs: Date.now() - startedAt }
    }
  }

  async tick(): Promise<void> {
    // A zone-level network cut sends nothing at all, so the heartbeat monitor
    // sees silence and drives the zone OFFLINE — exactly as a real outage would.
    if (this.state.networkDisconnected) return
    await this.send(this.buildPayload())
  }

  /** Fires a heartbeat without a reading. */
  async heartbeat(): Promise<void> {
    const apiKey = zoneKeyFor(this.zone.code)
    await fetch(
      `${env.SIM_INGESTION_BASE_URL}/ingestion/zones/${this.zone.id}/heartbeat`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-zone-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ sentAt: new Date().toISOString() }),
      }
    ).catch(() => undefined)
  }

  lastSequenceNumber(): number {
    return this.sequenceNumber
  }

  toDto(): SimulatorZoneStateDto {
    return {
      zoneId: this.zone.id,
      zoneCode: this.zone.code,
      zoneName: this.zone.name,
      running: this.running,
      intervalMs: this.state.intervalMs,
      fireDetected: this.state.fireDetected,
      gasLevel: this.state.gasLevel,
      waterLevel: this.state.waterLevel,
      occupancyDetected: this.state.occupancyDetected,
      disconnectedSensors: [...this.state.disconnectedSensors],
      networkDisconnected: this.state.networkDisconnected,
      warmupMode: this.state.warmupMode,
      sequenceNumber: this.sequenceNumber,
      hasCredential: this.hasCredential,
      lastStatusCode: this.lastStatusCode,
      sentCount: this.sentCount,
      acceptedCount: this.acceptedCount,
      rejectedCount: this.rejectedCount,
    }
  }
}
