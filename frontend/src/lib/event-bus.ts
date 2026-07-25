import type { ServerToClientEvents } from "@scsrg/shared"

export type SocketEventMeta = {
  /** False when the event predates this connection — apply, but do not alarm. */
  shouldNotify: boolean
}

type BusListener = (payload: unknown, meta: SocketEventMeta) => void

/**
 * In-process fan-out for server events.
 *
 * De-duplication has to happen **once per delivered event**, not once per
 * subscriber: with the filter inside each listener, the first hook to subscribe
 * would consume the `eventId` and every other hook would silently drop the
 * event. That is how a cache update can land while its toast never fires.
 *
 * So the socket is read by exactly one listener, which de-duplicates and then
 * publishes here to as many subscribers as the UI needs.
 */
class EventBus {
  private readonly listeners = new Map<string, Set<BusListener>>()

  subscribe(event: string, listener: BusListener): () => void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener)
    this.listeners.set(event, set)

    return () => {
      this.listeners.get(event)?.delete(listener)
    }
  }

  publish(
    event: keyof ServerToClientEvents | string,
    payload: unknown,
    meta: SocketEventMeta
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload, meta)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

export const eventBus = new EventBus()
