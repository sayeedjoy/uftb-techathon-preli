import {
  ACTUATION_TYPE,
  LED_COLOR,
  ZONE_STATE,
  type ActuationType,
  type LedColor,
  type ZoneState,
} from "@scsrg/shared"

export type ActuatorState = {
  led: LedColor
  buzzer: boolean
  relayCutoff: boolean
}

/**
 * Desired actuator state is a **pure function of zone state** (spec §9.3).
 *
 * OFFLINE deliberately leaves the buzzer and relay untouched: losing contact
 * with a zone is not evidence the hazard ended, so silencing an alarm because a
 * node stopped reporting would be exactly the wrong behaviour. Only the LED
 * changes, to an amber pulse that is visually distinct from WARNING.
 */
export function resolveDesiredActuation(
  state: ZoneState,
  current: ActuatorState
): ActuatorState {
  switch (state) {
    case ZONE_STATE.SAFE:
      return { led: LED_COLOR.GREEN, buzzer: false, relayCutoff: false }
    case ZONE_STATE.WARNING:
      return { led: LED_COLOR.YELLOW, buzzer: false, relayCutoff: false }
    case ZONE_STATE.CRITICAL:
      return { led: LED_COLOR.RED, buzzer: true, relayCutoff: true }
    case ZONE_STATE.OFFLINE:
      return {
        led: LED_COLOR.AMBER_PULSE,
        buzzer: current.buzzer,
        relayCutoff: current.relayCutoff,
      }
  }
}

export type ActuationDelta = {
  type: ActuationType
  payload: Record<string, unknown>
}

/**
 * Diffs desired against last-known state and returns only what changed.
 *
 * This is what keeps a zone sitting in CRITICAL for a minute from emitting one
 * buzzer command per reading: at 5 Hz that would be three hundred commands
 * where one is correct.
 */
export function diffActuation(
  current: ActuatorState,
  desired: ActuatorState
): ActuationDelta[] {
  const deltas: ActuationDelta[] = []

  if (current.led !== desired.led) {
    deltas.push({
      type: ACTUATION_TYPE.SET_LED,
      payload: { color: desired.led, previousColor: current.led },
    })
  }

  if (current.buzzer !== desired.buzzer) {
    deltas.push({
      type: desired.buzzer
        ? ACTUATION_TYPE.ACTIVATE_BUZZER
        : ACTUATION_TYPE.DEACTIVATE_BUZZER,
      payload: { active: desired.buzzer },
    })
  }

  if (current.relayCutoff !== desired.relayCutoff) {
    deltas.push({
      type: desired.relayCutoff
        ? ACTUATION_TYPE.ACTIVATE_RELAY
        : ACTUATION_TYPE.DEACTIVATE_RELAY,
      payload: { active: desired.relayCutoff },
    })
  }

  return deltas
}
