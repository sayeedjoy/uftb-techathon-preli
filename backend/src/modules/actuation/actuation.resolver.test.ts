import { describe, expect, it } from "vitest"

import {
  diffActuation,
  resolveDesiredActuation,
  type ActuatorState,
} from "./actuation.resolver.js"

const safeState: ActuatorState = {
  led: "GREEN",
  buzzer: false,
  relayCutoff: false,
}

const criticalState: ActuatorState = {
  led: "RED",
  buzzer: true,
  relayCutoff: true,
}

describe("resolveDesiredActuation", () => {
  it("maps SAFE to green, silent, powered", () => {
    expect(resolveDesiredActuation("SAFE", criticalState)).toEqual({
      led: "GREEN",
      buzzer: false,
      relayCutoff: false,
    })
  })

  it("maps WARNING to yellow with no buzzer and no cutoff", () => {
    expect(resolveDesiredActuation("WARNING", safeState)).toEqual({
      led: "YELLOW",
      buzzer: false,
      relayCutoff: false,
    })
  })

  it("maps CRITICAL to red, buzzer on, relay cut", () => {
    expect(resolveDesiredActuation("CRITICAL", safeState)).toEqual({
      led: "RED",
      buzzer: true,
      relayCutoff: true,
    })
  })

  it("leaves the buzzer and relay untouched when a zone goes OFFLINE mid-alarm", () => {
    // Losing contact is not evidence the hazard ended.
    expect(resolveDesiredActuation("OFFLINE", criticalState)).toEqual({
      led: "AMBER_PULSE",
      buzzer: true,
      relayCutoff: true,
    })
  })

  it("uses a distinct LED for OFFLINE so it cannot be read as WARNING", () => {
    const offline = resolveDesiredActuation("OFFLINE", safeState)
    const warning = resolveDesiredActuation("WARNING", safeState)

    expect(offline.led).not.toBe(warning.led)
  })
})

describe("diffActuation", () => {
  it("emits nothing when the desired state already holds", () => {
    expect(diffActuation(criticalState, criticalState)).toEqual([])
  })

  it("emits one command per changed actuator on entering CRITICAL", () => {
    const deltas = diffActuation(safeState, criticalState)

    expect(deltas.map((delta) => delta.type)).toEqual([
      "SET_LED",
      "ACTIVATE_BUZZER",
      "ACTIVATE_RELAY",
    ])
  })

  it("emits deactivation commands on recovery", () => {
    const deltas = diffActuation(criticalState, safeState)

    expect(deltas.map((delta) => delta.type)).toEqual([
      "SET_LED",
      "DEACTIVATE_BUZZER",
      "DEACTIVATE_RELAY",
    ])
  })

  it("emits only the LED change for SAFE → WARNING", () => {
    const deltas = diffActuation(
      safeState,
      resolveDesiredActuation("WARNING", safeState)
    )

    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.type).toBe("SET_LED")
    expect(deltas[0]?.payload).toEqual({
      color: "YELLOW",
      previousColor: "GREEN",
    })
  })

  it("stays idempotent across repeated CRITICAL readings", () => {
    let current = safeState
    let commandCount = 0

    for (let i = 0; i < 50; i += 1) {
      const desired = resolveDesiredActuation("CRITICAL", current)
      commandCount += diffActuation(current, desired).length
      current = desired
    }

    // Three commands on entry, none for the other forty-nine readings.
    expect(commandCount).toBe(3)
  })
})
