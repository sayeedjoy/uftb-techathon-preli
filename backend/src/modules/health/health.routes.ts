import { Router } from "express"

import { asyncHandler } from "../../shared/async-handler.js"
import { ok } from "../../shared/response.js"
import { checkDatabase } from "../../database/prisma.js"

export const healthRouter: Router = Router()

const startedAt = Date.now()

/** Liveness. Deliberately leaks nothing beyond uptime and version. */
healthRouter.get("/health", (_req, res) => {
  ok(res, {
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? "0.1.0",
  })
})

/** Readiness. Reports database reachability without exposing the DSN. */
healthRouter.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    const database = await checkDatabase()
    res.status(database.connected ? 200 : 503)
    res.json({
      success: database.connected,
      data: {
        status: database.connected ? "ready" : "degraded",
        database: {
          connected: database.connected,
          latencyMs: database.latencyMs,
        },
      },
    })
  })
)
