import type { Server as HttpServer } from "node:http"
import { Server, type Socket } from "socket.io"
import {
  SOCKET_ROOM,
  USER_ROLE,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type UserRole,
} from "@scsrg/shared"

import { corsOrigins } from "../config/env.js"
import { logger } from "../config/logger.js"
import { extractBearerToken, verifyAccessToken } from "../modules/auth/token.util.js"

export type SocketData = {
  userId: string
  email: string
  role: UserRole
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

let io: TypedServer | null = null

export function getSocketServer(): TypedServer | null {
  return io
}

/** Exposed on the System Health page. */
export function socketConnectionCount(): number {
  return io ? io.sockets.sockets.size : 0
}

/**
 * Socket.IO with the same JWT the REST API uses.
 *
 * An unauthenticated handshake is refused outright — the dashboard is a
 * security surface, and an anonymous listener would see every hazard event on
 * campus.
 */
export function createSocketServer(httpServer: HttpServer): TypedServer {
  const server: TypedServer = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: corsOrigins, credentials: true },
    serveClient: false,
  })

  server.use((socket, next) => {
    const handshakeToken =
      (socket.handshake.auth as { token?: unknown } | undefined)?.token ??
      extractBearerToken(socket.handshake.headers.authorization)

    if (typeof handshakeToken !== "string" || handshakeToken.length === 0) {
      next(new Error("UNAUTHENTICATED"))
      return
    }

    try {
      const claims = verifyAccessToken(handshakeToken)
      socket.data.userId = claims.sub
      socket.data.email = claims.email
      socket.data.role = claims.role
      next()
    } catch {
      next(new Error("UNAUTHENTICATED"))
    }
  })

  server.on("connection", (socket) => {
    void socket.join(SOCKET_ROOM.dashboard)
    if (socket.data.role === USER_ROLE.ADMIN) {
      void socket.join(SOCKET_ROOM.admin)
    }

    logger.debug(
      { userId: socket.data.userId, role: socket.data.role },
      "Dashboard socket connected"
    )

    socket.on("zone:subscribe", (zoneId) => {
      if (typeof zoneId === "string" && zoneId.length > 0) {
        void socket.join(SOCKET_ROOM.zone(zoneId))
      }
    })

    socket.on("zone:unsubscribe", (zoneId) => {
      if (typeof zoneId === "string" && zoneId.length > 0) {
        void socket.leave(SOCKET_ROOM.zone(zoneId))
      }
    })

    socket.on("disconnect", (reason) => {
      logger.debug({ userId: socket.data.userId, reason }, "Socket disconnected")
    })
  })

  io = server
  return server
}

export function closeSocketServer(): Promise<void> {
  const server = io
  io = null
  if (!server) return Promise.resolve()

  return new Promise<void>((resolve) => {
    // `close` is callback-style; the returned value is not a promise we own.
    void server.close(() => {
      resolve()
    })
  })
}
