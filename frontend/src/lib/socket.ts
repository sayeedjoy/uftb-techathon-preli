import { io, type Socket } from "socket.io-client"
import type { ClientToServerEvents, ServerToClientEvents } from "@scsrg/shared"

import { getStoredToken } from "./auth-storage.ts"

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionStatus = "LIVE" | "RECONNECTING" | "OFFLINE"

let socket: TypedSocket | null = null

/**
 * Connection status lives outside React and is read with
 * `useSyncExternalStore`. The socket is an external system, so mirroring its
 * state into component state inside an effect would mean a cascading render on
 * every reconnect — and React's own lint rules rightly object to it.
 */
let status: ConnectionStatus = "OFFLINE"
const statusListeners = new Set<() => void>()

export function subscribeToStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export function getStatusSnapshot(): ConnectionStatus {
  return status
}

function setStatus(next: ConnectionStatus): void {
  if (status === next) return
  status = next
  for (const listener of statusListeners) listener()
}

/**
 * Millisecond timestamp at which the *current* connection was established.
 *
 * Events stamped before this are still applied to the cache — they are true —
 * but raise no notification, so a reconnect that replays recent history cannot
 * re-alarm the control room.
 */
let connectedAtMs = 0

export function connectionEstablishedAt(): number {
  return connectedAtMs
}

export function getSocket(): TypedSocket | null {
  return socket
}

export function connectSocket(): TypedSocket {
  if (socket) return socket

  const url = import.meta.env.VITE_SOCKET_URL || undefined

  socket = io(url ?? "", {
    path: "/socket.io",
    // The same JWT the REST API uses; an unauthenticated handshake is refused.
    auth: { token: getStoredToken() ?? "" },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.4,
  }) as TypedSocket

  socket.on("connect", () => {
    connectedAtMs = Date.now()
    setStatus("LIVE")
  })
  socket.on("disconnect", () => setStatus("RECONNECTING"))
  socket.on("connect_error", () => setStatus("RECONNECTING"))
  socket.io.on("reconnect_attempt", () => setStatus("RECONNECTING"))

  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
  connectedAtMs = 0
  setStatus("OFFLINE")
}

/** True when the event predates the current connection — apply, do not alarm. */
export function isBackdated(emittedAt: string): boolean {
  if (!connectedAtMs) return false
  const stamped = Date.parse(emittedAt)
  return Number.isFinite(stamped) && stamped < connectedAtMs
}
