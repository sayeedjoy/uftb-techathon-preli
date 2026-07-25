import { describe, expect, it } from "vitest"

import type { PriorityConfig } from "../../config/priority.config.js"
import {
  computePriority,
  rankIncidents,
  type PriorityCandidate,
} from "./priority.service.js"

const config: PriorityConfig = {
  occupancyBonus: 10,
  durationBonusMax: 10,
  durationSecondsPerPoint: 6,
  multiHazardBonus: 5,
  acknowledgedPenalty: 15,
  humanReportBonusMax: 5,
}

const NOW = new Date("2026-07-25T10:31:00.000Z")

function candidate(
  overrides: Partial<PriorityCandidate> = {}
): PriorityCandidate {
  return {
    incidentId: "incident-a",
    zoneId: "zone-a",
    zoneCode: "iot-lab",
    zoneName: "IoT Lab",
    status: "OPEN",
    riskScore: 84,
    startedAt: new Date("2026-07-25T10:30:12.000Z"),
    assetImportance: 5,
    dominantHazards: ["FIRE", "GAS"],
    occupied: true,
    occupancyKnown: true,
    activeHazardCount: 2,
    ...overrides,
  }
}

describe("computePriority", () => {
  it("reproduces the specification's worked example", () => {
    // risk 84 + occupied 10 + 48s→8 + asset 5 + multi-hazard 5 = 112
    const result = computePriority(candidate(), NOW, config)

    expect(result.criticalDurationSeconds).toBe(48)
    expect(result.breakdown).toEqual({
      risk: 84,
      occupancy: 10,
      duration: 8,
      asset: 5,
      multiHazard: 5,
      acknowledged: 0,
      humanReport: 0,
    })
    expect(result.priorityScore).toBe(112)
  })

  it("explains every contributing term in plain English", () => {
    const result = computePriority(candidate(), NOW, config)

    expect(result.reasons).toEqual([
      "Live risk score 84",
      "Zone is occupied (+10)",
      "Confirmed fire and gas hazards (+5)",
      "Critical for 48 seconds (+8)",
      "High-value zone, asset importance 5 (+5)",
    ])
  })

  it("caps the duration bonus", () => {
    const result = computePriority(
      candidate({ startedAt: new Date("2026-07-25T09:00:00.000Z") }),
      NOW,
      config
    )

    expect(result.breakdown.duration).toBe(10)
  })

  it("treats unknown occupancy as occupied and says so", () => {
    const result = computePriority(
      candidate({ occupied: true, occupancyKnown: false }),
      NOW,
      config
    )

    expect(result.breakdown.occupancy).toBe(10)
    expect(result.reasons).toContain(
      "Occupancy unknown — treated as occupied so dispatch fails safe (+10)"
    )
  })

  it("gives no occupancy bonus to a confirmed empty zone", () => {
    const result = computePriority(
      candidate({ occupied: false, occupancyKnown: true }),
      NOW,
      config
    )

    expect(result.breakdown.occupancy).toBe(0)
    expect(result.reasons).toContain("Zone is confirmed empty (+0)")
  })

  it("withholds the multi-hazard bonus for a single hazard", () => {
    const result = computePriority(
      candidate({ activeHazardCount: 1, dominantHazards: ["FIRE"] }),
      NOW,
      config
    )

    expect(result.breakdown.multiHazard).toBe(0)
  })

  it("penalises an acknowledged incident", () => {
    const result = computePriority(
      candidate({ status: "ACKNOWLEDGED" }),
      NOW,
      config
    )

    expect(result.breakdown.acknowledged).toBe(-15)
    expect(result.priorityScore).toBe(97)
  })

  it("bounds the human-report bonus", () => {
    const result = computePriority(
      candidate({ confirmedReportSeverity: 99 }),
      NOW,
      config
    )

    expect(result.breakdown.humanReport).toBe(5)
  })

  it("never reports a negative duration for a future start time", () => {
    const result = computePriority(
      candidate({ startedAt: new Date("2026-07-25T11:00:00.000Z") }),
      NOW,
      config
    )

    expect(result.criticalDurationSeconds).toBe(0)
    expect(result.breakdown.duration).toBe(0)
  })
})

describe("rankIncidents determinism", () => {
  const incidents: PriorityCandidate[] = [
    candidate({ incidentId: "a", riskScore: 84, assetImportance: 5 }),
    candidate({
      incidentId: "b",
      zoneId: "zone-b",
      riskScore: 92,
      assetImportance: 8,
      dominantHazards: ["FIRE", "WATER"],
    }),
    candidate({
      incidentId: "c",
      zoneId: "zone-c",
      riskScore: 70,
      assetImportance: 6,
      activeHazardCount: 1,
      dominantHazards: ["GAS"],
      occupied: false,
      occupancyKnown: true,
    }),
  ]

  it("produces byte-identical rankings for 100 shuffled permutations", () => {
    const baseline = JSON.stringify(
      rankIncidents(incidents, NOW, config).map((entry) => [
        entry.rank,
        entry.incidentId,
        entry.priorityScore,
      ])
    )

    for (let seed = 0; seed < 100; seed += 1) {
      const shuffled = deterministicShuffle(incidents, seed)
      const actual = JSON.stringify(
        rankIncidents(shuffled, NOW, config).map((entry) => [
          entry.rank,
          entry.incidentId,
          entry.priorityScore,
        ])
      )
      expect(actual).toBe(baseline)
    }
  })

  it("ranks the highest priority score first", () => {
    const ranked = rankIncidents(incidents, NOW, config)

    expect(ranked[0]?.incidentId).toBe("b")
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3])
  })

  it("breaks a full tie by start time, then by id", () => {
    const older = candidate({
      incidentId: "zzz",
      startedAt: new Date("2026-07-25T10:30:00.000Z"),
    })
    const newer = candidate({
      incidentId: "aaa",
      zoneId: "zone-b",
      startedAt: new Date("2026-07-25T10:30:00.000Z"),
    })

    const ranked = rankIncidents([newer, older], NOW, config)

    // Same score and same start time → the lexicographically smaller id wins.
    expect(ranked.map((entry) => entry.incidentId)).toEqual(["aaa", "zzz"])
  })

  it("prefers the earlier incident when scores tie", () => {
    const first = candidate({
      incidentId: "later",
      startedAt: new Date("2026-07-25T10:30:12.000Z"),
    })
    const second = candidate({
      incidentId: "earlier",
      zoneId: "zone-b",
      startedAt: new Date("2026-07-25T10:30:12.000Z"),
      riskScore: 90,
    })

    const ranked = rankIncidents([first, second], NOW, config)
    expect(ranked[0]?.incidentId).toBe("earlier")
  })

  it("ranks an acknowledged incident below an unacknowledged one of equal risk", () => {
    const open = candidate({ incidentId: "open-one" })
    const acknowledged = candidate({
      incidentId: "ack-one",
      zoneId: "zone-b",
      status: "ACKNOWLEDGED",
    })

    const ranked = rankIncidents([acknowledged, open], NOW, config)

    expect(ranked[0]?.incidentId).toBe("open-one")
    expect(ranked[1]?.incidentId).toBe("ack-one")
  })

  it("returns an empty array for no active incidents", () => {
    expect(rankIncidents([], NOW, config)).toEqual([])
  })
})

/** Deterministic Fisher-Yates so the test is reproducible, not merely random. */
function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items]
  let state = seed + 1
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a !== undefined && b !== undefined) {
      copy[i] = b
      copy[j] = a
    }
  }
  return copy
}
