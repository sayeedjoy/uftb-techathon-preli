import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
} from "express-rate-limit"
import { ERROR_CODE } from "@scsrg/shared"

import { env, isTest } from "../config/env.js"

const ONE_MINUTE_MS = 60_000

function build(limit: number, name: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    // Tests exercise the limiter explicitly; a global cap would make every
    // other integration test order-dependent.
    limit: isTest ? Number.MAX_SAFE_INTEGER : limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Rate-limit responses use the same envelope as everything else.
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        error: {
          code: ERROR_CODE.RATE_LIMITED,
          message: `Too many requests to ${name}. Try again in a minute.`,
        },
      }),
  })
}

/** 5/min/IP — protects login from credential stuffing. */
export const authRateLimit = build(env.RATE_LIMIT_AUTH_PER_MIN, "authentication")

/** Test-only variant that ignores the NODE_ENV bypass above. */
export function buildAuthRateLimitForTest(limit: number) {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        error: {
          code: ERROR_CODE.RATE_LIMITED,
          message: "Too many requests to authentication. Try again in a minute.",
        },
      }),
  })
}

export const apiRateLimit = build(env.RATE_LIMIT_API_PER_MIN, "the API")

/**
 * Ingestion is limited **per zone**, not per IP.
 *
 * Every sensor node is a separate device with its own budget; keying on IP
 * would mean thirty nodes behind one campus NAT (or one simulator host) share a
 * single quota and throttle each other, which is exactly the wrong behaviour
 * for the system's busiest path.
 */
export const ingestionRateLimit = rateLimit({
  windowMs: ONE_MINUTE_MS,
  limit: isTest ? Number.MAX_SAFE_INTEGER : env.RATE_LIMIT_INGESTION_PER_MIN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    // The limiter runs as router-level middleware, before Express has matched a
    // route and populated `req.params`, so the zone is read from the path.
    const match = /\/ingestion\/zones\/([^/?]+)/.exec(req.originalUrl)
    const zoneId = match?.[1]
    if (zoneId) return `zone:${zoneId}`

    // `ipKeyGenerator` normalises IPv6 to its /64 prefix; a raw address would
    // let one subnet spend the whole budget one address at a time.
    return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`
  },
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODE.RATE_LIMITED,
        message:
          "This zone is submitting readings faster than the configured limit.",
      },
    }),
})
