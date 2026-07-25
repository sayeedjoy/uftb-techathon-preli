import type { NextFunction, Request, Response } from "express"
import { randomUUID } from "node:crypto"

/** Correlates a log line, an error response and an audit row to one request. */
export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers["x-request-id"]
  const requestId =
    typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID()

  res.setHeader("x-request-id", requestId)
  req.requestId = requestId
  next()
}

/** Best-effort client IP for the audit log; respects a single proxy hop. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? null
  }
  return req.ip ?? req.socket.remoteAddress ?? null
}
