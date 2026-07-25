import { vi } from "vitest"
import type { ServerToClientEvents } from "@scsrg/shared"

type Listener = (payload: unknown) => void

/**
 * An in-repo fake `Socket`.
 *
 * Tests emit server events into this and assert what the UI does, without a
 * real transport, real timers or a real network. `emitted` records what the
 * client sent back (room subscriptions), so those can be asserted too.
 */
type AnyListener = (event: string, payload: unknown) => void

class SocketDouble {
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly anyListeners = new Set<AnyListener>()
  readonly emitted: Array<{ event: string; args: unknown[] }> = []
  connected = true

  readonly io = {
    on: vi.fn(),
    off: vi.fn(),
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener)
    this.listeners.set(event, set)
    return this
  }

  off(event: string, listener?: Listener): this {
    if (!listener) {
      this.listeners.delete(event)
      return this
    }
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args })
    return this
  }

  onAny(listener: AnyListener): this {
    this.anyListeners.add(listener)
    return this
  }

  offAny(listener: AnyListener): this {
    this.anyListeners.delete(listener)
    return this
  }

  disconnect(): this {
    this.connected = false
    return this
  }

  /** Delivers a server → client event to every registered listener. */
  server<E extends keyof ServerToClientEvents>(
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0]
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload)
    }
    // Mirror socket.io: catch-all listeners see every event too.
    for (const listener of this.anyListeners) {
      listener(event, payload)
    }
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }

  reset(): void {
    this.listeners.clear()
    this.anyListeners.clear()
    this.emitted.length = 0
    this.connected = true
  }
}

export const socketDouble = new SocketDouble()

export function resetSocketDouble(): void {
  socketDouble.reset()
}

let eventCounter = 0

/** Stamps a payload the way the server's emitter does. */
export function withEnvelope<T extends object>(
  payload: T,
  overrides: { eventId?: string; emittedAt?: string } = {}
): T & { eventId: string; emittedAt: string } {
  eventCounter += 1
  return {
    ...payload,
    eventId: overrides.eventId ?? `event-${eventCounter}`,
    emittedAt: overrides.emittedAt ?? new Date(Date.now() + 1000).toISOString(),
  }
}
