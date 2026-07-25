import {
  SOCKET_ROOM,
  type ServerToClientEvents,
  type WithEnvelope,
} from "@scsrg/shared"

import { newEventId } from "../shared/id.js"
import { getSocketServer } from "./socket-server.js"

/** Payload type of a given server → client event, minus the envelope. */
type PayloadOf<E extends keyof ServerToClientEvents> =
  Parameters<ServerToClientEvents[E]>[0] extends WithEnvelope<infer P>
    ? P
    : never

export type EmitTarget =
  { room: "dashboard" } | { room: "admin" } | { room: "zone"; zoneId: string }

function roomName(target: EmitTarget): string {
  switch (target.room) {
    case "admin":
      return SOCKET_ROOM.admin
    case "zone":
      return SOCKET_ROOM.zone(target.zoneId)
    default:
      return SOCKET_ROOM.dashboard
  }
}

/**
 * The only way a domain event reaches a client.
 *
 * Every payload is stamped with a fresh `eventId` and `emittedAt` here, which
 * is what lets the browser de-duplicate replays after a reconnect without each
 * individual toast site having to remember to do it.
 */
export function emitToRoom<E extends keyof ServerToClientEvents>(
  target: EmitTarget,
  event: E,
  payload: PayloadOf<E>
): void {
  const io = getSocketServer()
  if (!io) return

  const stamped = Object.assign(
    { eventId: newEventId(), emittedAt: new Date().toISOString() },
    payload as object
  )

  // socket.io's variadic emit signature cannot narrow through this generic, so
  // the one unavoidable cast is contained here rather than at every call site.
  const channel = io.to(roomName(target)) as unknown as {
    emit: (name: string, data: unknown) => void
  }
  channel.emit(event, stamped)
}

export function emitToDashboard<E extends keyof ServerToClientEvents>(
  event: E,
  payload: PayloadOf<E>
): void {
  emitToRoom({ room: "dashboard" }, event, payload)
}

export function emitToAdmins<E extends keyof ServerToClientEvents>(
  event: E,
  payload: PayloadOf<E>
): void {
  emitToRoom({ room: "admin" }, event, payload)
}

export function emitToZone<E extends keyof ServerToClientEvents>(
  zoneId: string,
  event: E,
  payload: PayloadOf<E>
): void {
  emitToRoom({ room: "zone", zoneId }, event, payload)
}
