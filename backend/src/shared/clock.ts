/**
 * Injectable clock.
 *
 * Every engine takes time as a parameter rather than reading `Date.now()`, so
 * debounce, warm-up and duration tests can advance time deterministically —
 * there is no `sleep()` anywhere in the unit suite (plan risk R8).
 */
export type Clock = {
  now(): Date
  nowMs(): number
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
}

/** Test double: time only moves when the test says so. */
export function createFakeClock(startMs = 0): Clock & {
  advance(ms: number): void
  set(ms: number): void
} {
  let current = startMs
  return {
    now: () => new Date(current),
    nowMs: () => current,
    advance(ms: number) {
      current += ms
    },
    set(ms: number) {
      current = ms
    },
  }
}
