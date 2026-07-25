import type { ReactElement, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { vi } from "vitest"

import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/features/auth/auth-provider"
import { socketDouble } from "./socket-double.ts"
import { ADMIN_USER, STAFF_USER, authState } from "./msw/handlers.ts"

// Every test drives the socket through the in-repo double: no real transport,
// no real timers, no flakiness from a background reconnect.
vi.mock("@/lib/socket", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/socket")>("@/lib/socket")
  return {
    ...actual,
    connectSocket: () => socketDouble,
    getSocket: () => socketDouble,
    disconnectSocket: () => socketDouble.reset(),
    // The double is always "connected" for the purposes of a component test.
    subscribeToStatus: () => () => {},
    getStatusSnapshot: () => "LIVE" as const,
    // The connection is "now", so fixture events (stamped in the future) notify.
    isBackdated: (emittedAt: string) =>
      Date.parse(emittedAt) < Date.now() - 1_000,
  }
})

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export type RenderOptions = {
  route?: string
  withAuth?: boolean
  queryClient?: QueryClient
}

/** Renders a subtree inside the providers a page actually depends on. */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions = {}
) {
  const queryClient = options.queryClient ?? testQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[options.route ?? "/"]}>
        <QueryClientProvider client={queryClient}>
          {options.withAuth === false ? (
            <>
              {children}
              {/* Same configuration as the app, so stacking behaves identically. */}
              <Toaster expand closeButton richColors visibleToasts={6} />
            </>
          ) : (
            <AuthProvider>
              {children}
              {/* Same configuration as the app, so stacking behaves identically. */}
              <Toaster expand closeButton richColors visibleToasts={6} />
            </AuthProvider>
          )}
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  return { ...render(ui, { wrapper: Wrapper }), queryClient }
}

/** Primes localStorage so `AuthProvider` restores a session immediately. */
export function signIn(role: "ADMIN" | "SECURITY_STAFF" = "SECURITY_STAFF") {
  const user = role === "ADMIN" ? ADMIN_USER : STAFF_USER
  // `/auth/me` is the source of truth on restore, so the mock must agree.
  authState.user = user
  window.localStorage.setItem("scsrg.token", "test-token")
  window.localStorage.setItem("scsrg.user", JSON.stringify(user))
  return user
}
