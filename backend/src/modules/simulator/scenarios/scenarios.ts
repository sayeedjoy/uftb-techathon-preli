import type { SimulatorStatePatchInput } from "@scsrg/shared"

/**
 * Declarative scenario definitions.
 *
 * A scenario is a list of `{ atMs, zoneCode, patch }` steps plus assertions.
 * The same definitions drive the one-click UI button *and* the headless runner
 * (`pnpm sim:scenario -- --id N`), so what a judge watches is exactly what the
 * test suite asserts — there is no second, divergent implementation.
 */
export type ScenarioStep = {
  /** Milliseconds from the start of the scenario. */
  atMs: number
  zoneCode?: string
  patch?: SimulatorStatePatchInput
  /** Named side effects the streamer alone cannot express. */
  action?:
    | "START"
    | "STOP"
    | "START_ALL"
    | "STOP_ALL"
    | "SEND_DUPLICATE"
    | "SEND_OUT_OF_ORDER"
    | "SEND_MALFORMED"
    | "SEND_IMPOSSIBLE"
    | "ACK_RACE"
    | "HEARTBEAT"
  note?: string
}

export type ScenarioAssertion = {
  description: string
  /** Evaluated against a snapshot gathered from the public API after the run. */
  check: (snapshot: ScenarioSnapshot) => { passed: boolean; detail: string }
}

export type ScenarioSnapshot = {
  zones: Array<{
    code: string
    state: string
    currentRiskScore: number
    lastSeenAt: string | null
    activeIncidentId: string | null
    reasons: string[]
  }>
  queue: Array<{
    rank: number
    zoneCode: string
    priorityScore: number
    reasons: string[]
    acknowledged: boolean
  }>
  /**
   * Incidents created *during this run*, by zone code.
   *
   * A delta, not a total: the database is seeded with history, so an absolute
   * count would say nothing about what the scenario itself caused.
   */
  incidentsByZone: Record<string, number>
  faultResults: Array<{ label: string; statusCode: number; body: unknown }>
  counters: {
    sent: number
    accepted: number
    rejected: number
  }
}

export type Scenario = {
  id: number
  name: string
  description: string
  demonstrates: string
  estimatedDurationMs: number
  steps: ScenarioStep[]
  assertions: ScenarioAssertion[]
}

const zoneState = (snapshot: ScenarioSnapshot, code: string) =>
  snapshot.zones.find((zone) => zone.code === code)

function expectState(
  snapshot: ScenarioSnapshot,
  code: string,
  expected: string[]
) {
  const zone = zoneState(snapshot, code)
  const passed = zone !== undefined && expected.includes(zone.state)
  return {
    passed,
    detail: zone
      ? `${code} is ${zone.state} (risk ${zone.currentRiskScore}); expected one of ${expected.join(", ")}`
      : `${code} was not present in the snapshot`,
  }
}

export const SCENARIOS: Scenario[] = [
  {
    id: 1,
    name: "Normal idle state",
    description:
      "All zones stream benign readings. Nothing should escalate.",
    demonstrates: "All zones SAFE, no incidents, no actuation",
    estimatedDurationMs: 6_000,
    steps: [
      {
        atMs: 0,
        action: "START_ALL",
        note: "Begin steady-state streaming for every zone",
      },
      {
        atMs: 100,
        zoneCode: "iot-lab",
        patch: { fireDetected: false, gasLevel: 0.05, occupancyDetected: true },
      },
      {
        atMs: 100,
        zoneCode: "server-room",
        patch: { fireDetected: false, waterLevel: 0.02, occupancyDetected: false },
      },
      {
        atMs: 100,
        zoneCode: "robotics-lab",
        patch: { fireDetected: false, gasLevel: 0.05, occupancyDetected: false },
      },
      { atMs: 5_500, action: "STOP_ALL" },
    ],
    assertions: [
      {
        description: "Every zone reports SAFE",
        check: (snapshot) => {
          const offenders = snapshot.zones.filter(
            (zone) => zone.state !== "SAFE"
          )
          return {
            passed: offenders.length === 0,
            detail:
              offenders.length === 0
                ? "All zones SAFE"
                : `Not SAFE: ${offenders.map((zone) => `${zone.code}=${zone.state}`).join(", ")}`,
          }
        },
      },
      {
        description: "No incidents are open",
        check: (snapshot) => ({
          passed: snapshot.queue.length === 0,
          detail: `Priority queue holds ${snapshot.queue.length} entries`,
        }),
      },
    ],
  },

  {
    id: 2,
    name: "Fire debounce",
    description:
      "A brief flicker must not raise an incident; sustained flame must. Clearing the flame recovers the zone.",
    demonstrates: "Debounce, incident creation, hysteresis-gated recovery",
    estimatedDurationMs: 22_000,
    steps: [
      { atMs: 0, zoneCode: "iot-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "iot-lab",
        patch: { fireDetected: false, gasLevel: 0.1, occupancyDetected: true },
      },
      {
        atMs: 2_000,
        zoneCode: "iot-lab",
        patch: { fireDetected: true },
        note: "Flicker — held for fewer readings than the debounce window",
      },
      { atMs: 2_900, zoneCode: "iot-lab", patch: { fireDetected: false } },
      {
        atMs: 7_000,
        zoneCode: "iot-lab",
        patch: { fireDetected: true, gasLevel: 0.8 },
        note: "Sustained flame — should confirm and open an incident",
      },
      {
        atMs: 14_000,
        zoneCode: "iot-lab",
        patch: { fireDetected: false, gasLevel: 0.05 },
        note: "Hazard cleared — recovery requires consecutive calm readings",
      },
      { atMs: 21_000, zoneCode: "iot-lab", action: "STOP" },
    ],
    assertions: [
      {
        description: "IoT Lab recovered to SAFE or WARNING after the fire cleared",
        check: (snapshot) => expectState(snapshot, "iot-lab", ["SAFE", "WARNING"]),
      },
      {
        description: "Exactly one incident was created for IoT Lab",
        check: (snapshot) => {
          const count = snapshot.incidentsByZone["iot-lab"] ?? 0
          return {
            passed: count === 1,
            detail: `IoT Lab incidents during this run: ${count} (the flicker must not create one)`,
          }
        },
      },
    ],
  },

  {
    id: 3,
    name: "Rising gas",
    description:
      "Gas climbs gradually; the contribution rises proportionally and the zone walks SAFE → WARNING → CRITICAL.",
    demonstrates: "Proportional gas contribution and threshold crossings",
    estimatedDurationMs: 16_000,
    steps: [
      { atMs: 0, zoneCode: "robotics-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "robotics-lab",
        patch: { gasLevel: 0, occupancyDetected: true, fireDetected: false },
      },
      { atMs: 6_000, zoneCode: "robotics-lab", patch: { gasLevel: 0.4 } },
      { atMs: 9_000, zoneCode: "robotics-lab", patch: { gasLevel: 0.8 } },
      {
        atMs: 12_000,
        zoneCode: "robotics-lab",
        patch: { gasLevel: 1, fireDetected: true },
        note: "Gas alone tops out at WARNING; flame is what makes it CRITICAL",
      },
      { atMs: 15_500, zoneCode: "robotics-lab", action: "STOP" },
    ],
    assertions: [
      {
        description: "Robotics Lab reached CRITICAL",
        check: (snapshot) => expectState(snapshot, "robotics-lab", ["CRITICAL"]),
      },
      {
        description: "The ranking explains the gas contribution",
        check: (snapshot) => {
          const entry = snapshot.queue.find(
            (item) => item.zoneCode === "robotics-lab"
          )
          return {
            passed: entry !== undefined && entry.reasons.length > 0,
            detail: entry
              ? `Reasons: ${entry.reasons.join(" | ")}`
              : "Robotics Lab is not in the priority queue",
          }
        },
      },
    ],
  },

  {
    id: 4,
    name: "Server room water leak",
    description:
      "Condensate rises under the racks: DRY → RISING → CRITICAL, with the zone escalating alongside it.",
    demonstrates: "Water phases and a non-fire critical path",
    estimatedDurationMs: 16_000,
    steps: [
      { atMs: 0, zoneCode: "server-room", action: "START" },
      {
        atMs: 200,
        zoneCode: "server-room",
        patch: { waterLevel: 0.02, occupancyDetected: false, fireDetected: false },
      },
      { atMs: 4_000, zoneCode: "server-room", patch: { waterLevel: 0.3 } },
      { atMs: 8_000, zoneCode: "server-room", patch: { waterLevel: 0.7 } },
      {
        atMs: 11_000,
        zoneCode: "server-room",
        patch: { waterLevel: 1, fireDetected: true, occupancyDetected: true },
      },
      { atMs: 15_500, zoneCode: "server-room", action: "STOP" },
    ],
    assertions: [
      {
        description: "Server Room reached CRITICAL",
        check: (snapshot) => expectState(snapshot, "server-room", ["CRITICAL"]),
      },
    ],
  },

  {
    id: 5,
    name: "Simultaneous multi-zone incident",
    description:
      "Two zones go critical seconds apart. Both are scored, both actuate independently, and the queue ranks and explains them.",
    demonstrates: "Independent actuation, deterministic ranking, visible rationale",
    estimatedDurationMs: 20_000,
    steps: [
      { atMs: 0, action: "START_ALL" },
      {
        atMs: 200,
        zoneCode: "iot-lab",
        patch: { fireDetected: false, gasLevel: 0.1, occupancyDetected: true },
      },
      {
        atMs: 200,
        zoneCode: "server-room",
        patch: { fireDetected: false, waterLevel: 0.05, occupancyDetected: false },
      },
      {
        atMs: 3_000,
        zoneCode: "iot-lab",
        patch: { fireDetected: true, gasLevel: 0.9 },
      },
      {
        atMs: 7_000,
        zoneCode: "server-room",
        // Fire 40 + water 18 alone is only 58; the room filling is what tips
        // this into CRITICAL, which is exactly the point of the occupancy term.
        patch: { fireDetected: true, waterLevel: 0.9, occupancyDetected: true },
      },
      { atMs: 19_000, action: "STOP_ALL" },
    ],
    assertions: [
      {
        description: "Both zones are CRITICAL at the same time",
        check: (snapshot) => {
          const iot = zoneState(snapshot, "iot-lab")
          const server = zoneState(snapshot, "server-room")
          const passed =
            iot?.state === "CRITICAL" && server?.state === "CRITICAL"
          return {
            passed,
            detail: `iot-lab=${iot?.state ?? "?"}, server-room=${server?.state ?? "?"}`,
          }
        },
      },
      {
        description: "The queue ranks them with an explanation for each",
        check: (snapshot) => {
          const ranked = snapshot.queue.filter((entry) =>
            ["iot-lab", "server-room"].includes(entry.zoneCode)
          )
          const passed =
            ranked.length === 2 &&
            ranked.every((entry) => entry.reasons.length > 0)
          return {
            passed,
            detail: ranked
              .map(
                (entry) =>
                  `#${entry.rank} ${entry.zoneCode} (${entry.priorityScore}): ${entry.reasons[0] ?? "no reason"}`
              )
              .join(" | "),
          }
        },
      },
      {
        description: "The higher-ranked of the two explains its lead",
        check: (snapshot) => {
          // Compare the two zones this scenario drives, rather than positions
          // 1 and 2, so an unrelated incident cannot mask the result.
          const ranked = snapshot.queue
            .filter((entry) => ["iot-lab", "server-room"].includes(entry.zoneCode))
            .sort((a, b) => a.rank - b.rank)
          const [first, second] = ranked

          if (!first || !second) {
            return { passed: false, detail: "Fewer than two ranked incidents" }
          }
          return {
            passed:
              first.priorityScore >= second.priorityScore &&
              first.reasons.length > 0,
            detail: `#${first.rank} ${first.zoneCode}=${first.priorityScore} (${first.reasons[0]}) vs #${second.rank} ${second.zoneCode}=${second.priorityScore}`,
          }
        },
      },
    ],
  },

  {
    id: 6,
    name: "Acknowledgment race",
    description:
      "Two officers acknowledge the same incident at the same moment. Exactly one wins.",
    demonstrates: "Database-enforced concurrency safety",
    estimatedDurationMs: 14_000,
    steps: [
      { atMs: 0, zoneCode: "iot-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "iot-lab",
        patch: { fireDetected: true, gasLevel: 0.9, occupancyDetected: true },
      },
      {
        atMs: 8_000,
        action: "ACK_RACE",
        note: "Fire two concurrent acknowledgments at the open incident",
      },
      { atMs: 13_000, zoneCode: "iot-lab", action: "STOP" },
    ],
    assertions: [
      {
        description: "Exactly one acknowledgment succeeded, the other got 409",
        check: (snapshot) => {
          const results = snapshot.faultResults.filter((result) =>
            result.label.startsWith("acknowledge")
          )
          const ok = results.filter((result) => result.statusCode === 200).length
          const conflict = results.filter(
            (result) => result.statusCode === 409
          ).length
          return {
            passed: ok === 1 && conflict === results.length - 1,
            detail: `${ok} × 200, ${conflict} × 409 out of ${results.length} requests`,
          }
        },
      },
    ],
  },

  {
    id: 7,
    name: "Sensor offline",
    description:
      "A zone stops reporting entirely. It must show OFFLINE — never SAFE, never empty.",
    demonstrates: "Offline detection and the never-SAFE rule",
    estimatedDurationMs: 20_000,
    steps: [
      { atMs: 0, zoneCode: "robotics-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "robotics-lab",
        patch: { gasLevel: 0.1, occupancyDetected: true, fireDetected: false },
      },
      {
        atMs: 4_000,
        zoneCode: "robotics-lab",
        patch: { networkDisconnected: true },
        note: "Cut the node's network — nothing is sent at all",
      },
      { atMs: 19_000, zoneCode: "robotics-lab", action: "STOP" },
    ],
    assertions: [
      {
        description: "Robotics Lab is OFFLINE, not SAFE",
        check: (snapshot) => {
          const zone = zoneState(snapshot, "robotics-lab")
          return {
            passed: zone?.state === "OFFLINE",
            detail: `robotics-lab=${zone?.state ?? "?"}, last seen ${zone?.lastSeenAt ?? "never"}`,
          }
        },
      },
      {
        description: "The zone explains why it is offline",
        check: (snapshot) => {
          const zone = zoneState(snapshot, "robotics-lab")
          return {
            passed: (zone?.reasons.length ?? 0) > 0,
            detail: zone?.reasons.join(" | ") ?? "no reasons recorded",
          }
        },
      },
    ],
  },

  {
    id: 8,
    name: "Dashboard reconnection",
    description:
      "An incident is raised while the dashboard socket is down; on reconnect the dashboard catches up from the API with no duplicate alerts.",
    demonstrates: "Sockets are never the only source of truth",
    estimatedDurationMs: 16_000,
    steps: [
      { atMs: 0, zoneCode: "server-room", action: "START" },
      {
        atMs: 200,
        zoneCode: "server-room",
        patch: { fireDetected: true, waterLevel: 0.8, occupancyDetected: true },
      },
      { atMs: 15_000, zoneCode: "server-room", action: "STOP" },
    ],
    assertions: [
      {
        description: "The incident is retrievable from the API after the fact",
        check: (snapshot) => {
          const entry = snapshot.queue.find(
            (item) => item.zoneCode === "server-room"
          )
          return {
            passed: entry !== undefined,
            detail: entry
              ? `Server Room ranked #${entry.rank}`
              : "Server Room is absent from the queue",
          }
        },
      },
    ],
  },

  {
    id: 9,
    name: "Invalid sensor value",
    description:
      "Negative and above-range values are rejected outright; no risk is ever computed from bad data.",
    demonstrates: "422 handling and input validation",
    estimatedDurationMs: 8_000,
    steps: [
      { atMs: 0, zoneCode: "iot-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "iot-lab",
        patch: { gasLevel: 0.1, occupancyDetected: false, fireDetected: false },
      },
      { atMs: 2_000, zoneCode: "iot-lab", action: "SEND_IMPOSSIBLE" },
      { atMs: 3_000, zoneCode: "iot-lab", action: "SEND_MALFORMED" },
      { atMs: 7_000, zoneCode: "iot-lab", action: "STOP" },
    ],
    assertions: [
      {
        description: "An out-of-range value is rejected with 422",
        check: (snapshot) => {
          const result = snapshot.faultResults.find(
            (entry) => entry.label === "IMPOSSIBLE_VALUE"
          )
          return {
            passed: result?.statusCode === 422,
            detail: `status ${result?.statusCode ?? "none"}`,
          }
        },
      },
      {
        description: "A malformed payload is rejected with 400",
        check: (snapshot) => {
          const result = snapshot.faultResults.find(
            (entry) => entry.label === "MALFORMED_PAYLOAD"
          )
          return {
            passed: result?.statusCode === 400,
            detail: `status ${result?.statusCode ?? "none"}`,
          }
        },
      },
      {
        description: "The zone did not escalate on the rejected data",
        check: (snapshot) => expectState(snapshot, "iot-lab", ["SAFE", "WARNING"]),
      },
    ],
  },

  {
    id: 10,
    name: "Backend restart recovery",
    description:
      "An active incident is persisted, then the backend is restarted. State and the priority queue are rebuilt from Postgres.",
    demonstrates: "Restart recovery — the backend never assumes zones are SAFE",
    estimatedDurationMs: 14_000,
    steps: [
      { atMs: 0, zoneCode: "iot-lab", action: "START" },
      {
        atMs: 200,
        zoneCode: "iot-lab",
        patch: { fireDetected: true, gasLevel: 0.9, occupancyDetected: true },
      },
      {
        atMs: 12_000,
        zoneCode: "iot-lab",
        action: "STOP",
        note: "Restart the backend now, then re-run the assertions",
      },
    ],
    assertions: [
      {
        description: "An active incident exists to survive the restart",
        check: (snapshot) => {
          const zone = zoneState(snapshot, "iot-lab")
          return {
            passed: zone?.activeIncidentId !== null,
            detail: zone?.activeIncidentId
              ? `Incident ${zone.activeIncidentId} is active`
              : "No active incident to recover",
          }
        },
      },
    ],
  },

  {
    id: 11,
    name: "Load handling",
    description:
      "Thirty or more simulated zones stream at high frequency. Accepted-reading counts must reconcile exactly.",
    demonstrates: "Throughput with no lost or duplicated accepted readings",
    estimatedDurationMs: 20_000,
    steps: [
      { atMs: 0, action: "START_ALL" },
      { atMs: 18_000, action: "STOP_ALL" },
    ],
    assertions: [
      {
        description: "Every submitted reading was accounted for",
        check: (snapshot) => {
          const unaccounted =
            snapshot.counters.sent -
            snapshot.counters.accepted -
            snapshot.counters.rejected
          return {
            passed: unaccounted === 0,
            detail: `sent=${snapshot.counters.sent} accepted=${snapshot.counters.accepted} rejected=${snapshot.counters.rejected} unaccounted=${unaccounted}`,
          }
        },
      },
      {
        description: "No accepted reading was rejected as a duplicate",
        check: (snapshot) => ({
          passed: snapshot.counters.rejected === 0,
          detail: `${snapshot.counters.rejected} rejected responses during the load run`,
        }),
      },
    ],
  },
]

export function findScenario(id: number): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}
