import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll, vi } from "vitest"
import { cleanup } from "@testing-library/react"

import { server } from "./msw/server.ts"
import { resetSocketDouble } from "./socket-double.ts"
import { eventBus } from "@/lib/event-bus"
import { eventDedupe } from "@/stores/event-dedupe"

// jsdom implements neither of these, and Recharts / base-ui both reach for them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetSocketDouble()
  eventBus.clear()
  eventDedupe.clear()
  window.localStorage.clear()
})

afterAll(() => server.close())
