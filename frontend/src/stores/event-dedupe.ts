/**
 * Bounded LRU of seen `eventId`s.
 *
 * A reconnect can replay recent events. Without this, every replayed
 * `incident:created` would re-alarm the room — which is exactly the failure the
 * spec calls out. The cache is bounded so a long demo cannot grow it without
 * limit.
 */
const MAX_TRACKED_EVENTS = 200

export class EventDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []
  private readonly limit: number

  constructor(limit = MAX_TRACKED_EVENTS) {
    this.limit = limit
  }

  /** @returns true the first time an id is seen, false for every repeat. */
  register(eventId: string): boolean {
    if (this.seen.has(eventId)) return false

    this.seen.add(eventId)
    this.order.push(eventId)

    while (this.order.length > this.limit) {
      const evicted = this.order.shift()
      if (evicted) this.seen.delete(evicted)
    }

    return true
  }

  has(eventId: string): boolean {
    return this.seen.has(eventId)
  }

  get size(): number {
    return this.seen.size
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

export const eventDedupe = new EventDedupe()
