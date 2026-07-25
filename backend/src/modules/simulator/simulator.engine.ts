import type {
  FaultInjection,
  SimulatorStatePatchInput,
  SimulatorStatusDto,
} from "@scsrg/shared"

import { env } from "../../config/env.js"
import { logger } from "../../config/logger.js"
import { NotFoundError } from "../../shared/errors.js"
import { SCENARIOS } from "./scenarios/scenarios.js"
import { ZoneStreamer } from "./zone-streamer.js"

/**
 * The simulator engine.
 *
 * Deliberately holds no repository and no Prisma client: it only knows how to
 * speak HTTP to the ingestion API, exactly like a physical node would. That
 * constraint is what makes a demo run prove the real pipeline rather than a
 * shortcut through it.
 */
class SimulatorEngine {
  private readonly streamers = new Map<string, ZoneStreamer>()

  activeScenario: SimulatorStatusDto["activeScenario"] = null

  register(
    zone: { id: string; code: string; name: string },
    sensors: string[],
    startSequenceAt = 0
  ): ZoneStreamer {
    const existing = this.streamers.get(zone.id)
    if (existing) return existing

    const streamer = new ZoneStreamer(zone, sensors, startSequenceAt)
    this.streamers.set(zone.id, streamer)
    return streamer
  }

  get(zoneId: string): ZoneStreamer {
    const streamer = this.streamers.get(zoneId)
    if (!streamer) {
      throw new NotFoundError("This zone is not registered with the simulator.")
    }
    return streamer
  }

  find(zoneId: string): ZoneStreamer | undefined {
    return this.streamers.get(zoneId)
  }

  byCode(code: string): ZoneStreamer | undefined {
    return [...this.streamers.values()].find(
      (streamer) => streamer.zone.code === code
    )
  }

  all(): ZoneStreamer[] {
    return [...this.streamers.values()]
  }

  count(): number {
    return this.streamers.size
  }

  start(zoneId: string, intervalMs?: number): void {
    this.get(zoneId).start(intervalMs)
  }

  stop(zoneId: string): void {
    this.get(zoneId).stop()
  }

  stopAll(): void {
    for (const streamer of this.streamers.values()) streamer.stop()
  }

  patch(zoneId: string, patch: SimulatorStatePatchInput): void {
    this.get(zoneId).patch(patch)
  }

  status(): SimulatorStatusDto {
    return {
      zones: this.all().map((streamer) => streamer.toDto()),
      activeScenario: this.activeScenario,
      scenarios: SCENARIOS.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        demonstrates: scenario.demonstrates,
        estimatedDurationMs: scenario.estimatedDurationMs,
      })),
    }
  }

  /**
   * Deliberately-wrong requests that prove the backend's defences.
   * Each returns the backend's real status code — nothing is swallowed.
   */
  async injectFault(
    zoneId: string,
    fault: FaultInjection
  ): Promise<{ statusCode: number; body: unknown; description: string }> {
    const streamer = this.get(zoneId)

    switch (fault) {
      case "MALFORMED_PAYLOAD": {
        const result = await streamer.send({
          readingId: "",
          sequenceNumber: "not-a-number",
          sensors: { gasLevel: "high" },
        })
        return { ...result, description: "Malformed payload — expect 400" }
      }

      case "IMPOSSIBLE_VALUE": {
        const payload = streamer.buildPayload()
        const result = await streamer.send({
          ...payload,
          sensors: { ...payload.sensors, gasLevel: 1.5 },
        })
        return {
          ...result,
          description: "Gas level above 1 — expect 422 VALUE_OUT_OF_RANGE",
        }
      }

      case "DUPLICATE_READING": {
        const payload = streamer.buildPayload()
        await streamer.send(payload)
        const result = await streamer.send(payload)
        return {
          ...result,
          description: "Same readingId twice — expect 409 DUPLICATE_READING",
        }
      }

      case "OUT_OF_ORDER_READING": {
        const stale = streamer.buildPayload({
          sequenceNumber: Math.max(0, streamer.lastSequenceNumber() - 10),
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
        })
        const result = await streamer.send(stale)
        return {
          ...result,
          description:
            "Stale reading — expect 201 with ACCEPTED_OUT_OF_ORDER and no live-state change",
        }
      }

      case "QUICK_CYCLE": {
        await this.quickCycle(zoneId)
        return {
          statusCode: 200,
          body: { cycled: true },
          description: "Ran a SAFE → WARNING → CRITICAL → SAFE cycle",
        }
      }
    }
  }

  /** SAFE → WARNING → CRITICAL → SAFE, driven entirely through the real API. */
  async quickCycle(zoneId: string): Promise<void> {
    const streamer = this.get(zoneId)
    const original = { ...streamer.state }

    streamer.patch({
      gasLevel: 0,
      fireDetected: false,
      occupancyDetected: true,
    })
    await streamer.tick()

    streamer.patch({ gasLevel: 0.8 })
    for (let i = 0; i < 3; i += 1) await streamer.tick()

    streamer.patch({ fireDetected: true, gasLevel: 1 })
    for (let i = 0; i < 6; i += 1) await streamer.tick()

    streamer.patch({ fireDetected: false, gasLevel: 0 })
    for (let i = 0; i < 8; i += 1) await streamer.tick()

    streamer.patch({
      fireDetected: original.fireDetected,
      gasLevel: original.gasLevel,
      waterLevel: original.waterLevel,
      occupancyDetected: original.occupancyDetected,
    })
  }

  maxZones(): number {
    return env.SIM_MAX_ZONES
  }

  reset(): void {
    this.stopAll()
    this.streamers.clear()
    this.activeScenario = null
    logger.debug("Simulator engine reset")
  }
}

export const simulator = new SimulatorEngine()
