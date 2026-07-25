/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ServerToClientEvents } from "@scsrg/shared"

import { useAuth } from "@/features/auth/auth-provider"
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  getStatusSnapshot,
  isBackdated,
  subscribeToStatus,
  type ConnectionStatus,
  type TypedSocket,
} from "@/lib/socket"
import { eventBus, type SocketEventMeta } from "@/lib/event-bus"
import { SNAPSHOT_QUERY_KEYS } from "@/lib/query-keys"
import { eventDedupe } from "@/stores/event-dedupe"

export type { SocketEventMeta }

type SocketState = {
  socket: TypedSocket | null
}

const SocketContext = React.createContext<SocketState | undefined>(undefined)

/**
 * Owns the single socket connection and the reconnect contract.
 *
 * Sockets are never the only source of truth: on connect *and every reconnect*
 * the four snapshot queries are refetched from the API, so a dashboard that
 * missed events while disconnected converges on the real state rather than
 * quietly showing a stale picture.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket()
      eventDedupe.clear()
      return
    }

    const socket = connectSocket()

    const handleConnect = () => {
      // Connect *and* every reconnect: the API, not the socket, is the truth.
      for (const key of SNAPSHOT_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    }

    // One reader for the whole socket: de-duplicate here, then fan out.
    // Filtering inside each subscriber would mean the first hook to register
    // consumed the event and every other hook silently missed it.
    const handleAny = (event: string, payload: unknown) => {
      const envelope = payload as
        { eventId?: string; emittedAt?: string } | undefined

      if (envelope?.eventId && !eventDedupe.register(envelope.eventId)) {
        return
      }

      eventBus.publish(event, payload, {
        shouldNotify: envelope?.emittedAt
          ? !isBackdated(envelope.emittedAt)
          : true,
      })
    }

    socket.on("connect", handleConnect)
    socket.onAny(handleAny)

    if (socket.connected) handleConnect()

    return () => {
      socket.off("connect", handleConnect)
      socket.offAny(handleAny)
    }
  }, [isAuthenticated, queryClient])

  React.useEffect(() => () => disconnectSocket(), [])

  const value = React.useMemo<SocketState>(() => ({ socket: getSocket() }), [])

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  )
}

/** Reads the live connection status straight from the socket store. */
export function useConnectionStatus(): ConnectionStatus {
  return React.useSyncExternalStore(
    subscribeToStatus,
    getStatusSnapshot,
    getStatusSnapshot
  )
}

export function useSocketStatus(): SocketState & { status: ConnectionStatus } {
  const context = React.useContext(SocketContext)
  const status = useConnectionStatus()

  if (!context) {
    throw new Error("useSocketStatus must be used inside a SocketProvider")
  }
  return { ...context, status }
}

type PayloadOf<E extends keyof ServerToClientEvents> = Parameters<
  ServerToClientEvents[E]
>[0]

/**
 * Subscribes to one server event.
 *
 * Many hooks can subscribe to the same event — each receives it exactly once,
 * because the de-duplication happened upstream at the single socket reader.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: (payload: PayloadOf<E>, meta: SocketEventMeta) => void
): void {
  const handlerRef = React.useRef(handler)

  // Assigning during render would make the ref observable mid-render; a layout
  // effect keeps the latest handler without that hazard.
  React.useLayoutEffect(() => {
    handlerRef.current = handler
  })

  React.useEffect(
    () =>
      eventBus.subscribe(event, (payload, meta) => {
        handlerRef.current(payload as PayloadOf<E>, meta)
      }),
    [event]
  )
}
