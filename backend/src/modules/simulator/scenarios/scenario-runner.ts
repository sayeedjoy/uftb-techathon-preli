import type { ScenarioRunResultDto, ZoneSummaryDto } from "@scsrg/shared"
import type { PriorityQueueEntryDto } from "@scsrg/shared"

import { env } from "../../../config/env.js"
import { logger } from "../../../config/logger.js"
import { NotFoundError } from "../../../shared/errors.js"
import { emitToAdmins } from "../../../realtime/emitter.js"
import { simulator } from "../simulator.engine.js"
import {
  findScenario,
  type Scenario,
  type ScenarioSnapshot,
  type ScenarioStep,
} from "./scenarios.js"

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })

/**
 * The caller's own bearer token, threaded through the run.
 *
 * The runner verifies through the *public API* rather than reaching into
 * Prisma, which keeps `modules/simulator` free of any data-access import and
 * simultaneously proves the API and the live state agree. Acting as the real
 * admin who launched the scenario also means the acknowledgment race writes a
 * genuine audit row against a genuine user.
 */
let authToken = ""

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${env.SIM_INGESTION_BASE_URL}${path}`, {
      headers: { authorization: `Bearer ${authToken}` },
    })
    if (!response.ok) return null
    const body = (await response.json()) as { success: boolean; data: T }
    return body.success ? body.data : null
  } catch (error) {
    logger.warn({ err: error, path }, "Scenario snapshot request failed")
    return null
  }
}

async function apiPost(
  path: string,
  body: unknown
): Promise<{ statusCode: number; body: unknown }> {
  try {
    const response = await fetch(`${env.SIM_INGESTION_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${authToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    })
    return {
      statusCode: response.status,
      body: await response.json().catch(() => null),
    }
  } catch (error) {
    return {
      statusCode: 0,
      body: { error: error instanceof Error ? error.message : "unknown" },
    }
  }
}

export type RunOptions = {
  /** Collapse the waits between steps — used by the headless test runner. */
  fast?: boolean
  /** Bearer token of the admin who launched the run. */
  authToken: string
}

export async function runScenario(
  scenarioId: number,
  options: RunOptions
): Promise<ScenarioRunResultDto> {
  const scenario = findScenario(scenarioId)
  if (!scenario) throw new NotFoundError(`No scenario with id ${scenarioId}.`)

  authToken = options.authToken
  const startedAt = new Date()

  // Clear residual hazard inputs first: clicking scenario 5 should demonstrate
  // scenario 5, not whatever scenario 3 left behind.
  for (const streamer of simulator.all()) {
    streamer.patch({
      fireDetected: false,
      gasLevel: 0,
      waterLevel: 0,
      occupancyDetected: false,
      disconnectedSensors: [],
      networkDisconnected: false,
    })
  }

  // Baseline the incident counts so assertions measure what this run caused,
  // not what the seed left behind.
  const baseline = await countIncidentsByZone()
  const faultResults: ScenarioSnapshot["faultResults"] = []

  simulator.activeScenario = {
    id: scenario.id,
    name: scenario.name,
    startedAt: startedAt.toISOString(),
    progress: 0,
    finished: false,
  }
  emitToAdmins("simulator:status", simulator.status())

  const steps = [...scenario.steps].sort((a, b) => a.atMs - b.atMs)
  let elapsed = 0

  for (const [index, step] of steps.entries()) {
    const wait = options.fast
      ? Math.min(step.atMs - elapsed, 400)
      : step.atMs - elapsed
    if (wait > 0) await sleep(wait)
    elapsed = step.atMs

    await executeStep(scenario, step, faultResults)

    simulator.activeScenario = {
      id: scenario.id,
      name: scenario.name,
      startedAt: startedAt.toISOString(),
      progress: Math.round(((index + 1) / steps.length) * 100),
      finished: false,
    }
    emitToAdmins("simulator:status", simulator.status())
  }

  // Give the offline sweep and the last in-flight readings time to land.
  await sleep(options.fast ? 500 : 1_500)

  const snapshot = await gatherSnapshot(faultResults, baseline)
  const assertions = scenario.assertions.map((assertion) => {
    const result = assertion.check(snapshot)
    return {
      description: assertion.description,
      passed: result.passed,
      detail: result.detail,
    }
  })

  simulator.activeScenario = {
    id: scenario.id,
    name: scenario.name,
    startedAt: startedAt.toISOString(),
    progress: 100,
    finished: true,
  }
  emitToAdmins("simulator:status", simulator.status())

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    passed: assertions.every((assertion) => assertion.passed),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    assertions,
  }
}

async function executeStep(
  scenario: Scenario,
  step: ScenarioStep,
  faultResults: ScenarioSnapshot["faultResults"]
): Promise<void> {
  const streamer = step.zoneCode ? simulator.byCode(step.zoneCode) : undefined

  if (step.patch && streamer) {
    streamer.patch(step.patch)
  }

  switch (step.action) {
    case "START":
      streamer?.start()
      break
    case "STOP":
      streamer?.stop()
      break
    case "START_ALL":
      for (const entry of simulator.all()) entry.start()
      break
    case "STOP_ALL":
      simulator.stopAll()
      break
    case "HEARTBEAT":
      await streamer?.heartbeat()
      break
    case "SEND_MALFORMED":
    case "SEND_IMPOSSIBLE":
    case "SEND_DUPLICATE":
    case "SEND_OUT_OF_ORDER": {
      if (!streamer) break
      const fault = (
        {
          SEND_MALFORMED: "MALFORMED_PAYLOAD",
          SEND_IMPOSSIBLE: "IMPOSSIBLE_VALUE",
          SEND_DUPLICATE: "DUPLICATE_READING",
          SEND_OUT_OF_ORDER: "OUT_OF_ORDER_READING",
        } as const
      )[step.action]

      const result = await simulator.injectFault(streamer.zone.id, fault)
      faultResults.push({
        label: fault,
        statusCode: result.statusCode,
        body: result.body,
      })
      break
    }
    case "ACK_RACE": {
      await runAcknowledgmentRace(scenario, faultResults)
      break
    }
    default:
      break
  }
}

/**
 * Fires N concurrent acknowledgments at the top incident.
 * Exactly one must return 200; the rest must return 409.
 */
async function runAcknowledgmentRace(
  _scenario: Scenario,
  faultResults: ScenarioSnapshot["faultResults"],
  concurrency = 2
): Promise<void> {
  const queue = await apiGet<{ queue: PriorityQueueEntryDto[] }>(
    "/priority-queue"
  )
  const target = queue?.queue[0]
  if (!target) {
    faultResults.push({
      label: "acknowledge:none",
      statusCode: 0,
      body: { error: "No active incident to acknowledge" },
    })
    return
  }

  const results = await Promise.all(
    Array.from({ length: concurrency }, () =>
      apiPost(`/incidents/${target.incidentId}/acknowledge`, {
        note: "Scenario 6 concurrency probe",
      })
    )
  )

  results.forEach((result, index) => {
    faultResults.push({
      label: `acknowledge:${index}`,
      statusCode: result.statusCode,
      body: result.body,
    })
  })
}

/** Absolute incident counts per zone code, used to compute run deltas. */
async function countIncidentsByZone(): Promise<Record<string, number>> {
  const zonesData = await apiGet<{ zones: ZoneSummaryDto[] }>("/zones")
  const counts: Record<string, number> = {}

  for (const zone of zonesData?.zones ?? []) {
    const incidents = await apiGet<{ incidents: Array<{ id: string }> }>(
      `/incidents?zoneId=${zone.id}&pageSize=200`
    )
    counts[zone.code] = incidents?.incidents.length ?? 0
  }

  return counts
}

async function gatherSnapshot(
  faultResults: ScenarioSnapshot["faultResults"],
  baseline: Record<string, number>
): Promise<ScenarioSnapshot> {
  const [zonesData, queueData] = await Promise.all([
    apiGet<{ zones: ZoneSummaryDto[] }>("/zones"),
    apiGet<{ queue: PriorityQueueEntryDto[] }>("/priority-queue"),
  ])

  const zones = zonesData?.zones ?? []
  const totals = await countIncidentsByZone()
  const incidentsByZone: Record<string, number> = {}
  for (const zone of zones) {
    incidentsByZone[zone.code] =
      (totals[zone.code] ?? 0) - (baseline[zone.code] ?? 0)
  }

  const counters = simulator.all().reduce(
    (accumulator, streamer) => {
      const dto = streamer.toDto()
      accumulator.sent += dto.sentCount
      accumulator.accepted += dto.acceptedCount
      accumulator.rejected += dto.rejectedCount
      return accumulator
    },
    { sent: 0, accepted: 0, rejected: 0 }
  )

  return {
    zones: zones.map((zone) => ({
      code: zone.code,
      state: zone.state,
      currentRiskScore: zone.currentRiskScore,
      lastSeenAt: zone.lastSeenAt,
      activeIncidentId: zone.activeIncident?.id ?? null,
      reasons: zone.reasons,
    })),
    queue: (queueData?.queue ?? []).map((entry) => ({
      rank: entry.rank,
      zoneCode: entry.zoneCode,
      priorityScore: entry.priorityScore,
      reasons: entry.reasons,
      acknowledged: entry.acknowledged,
    })),
    incidentsByZone,
    faultResults,
    counters,
  }
}
