import { randomUUID } from "node:crypto"

import express, { type Express } from "express"
import cors from "cors"
import helmet from "helmet"
import { pinoHttp } from "pino-http"

import { API_PREFIX, corsOrigins, isTest } from "./config/env.js"
import { logger } from "./config/logger.js"
import { apiRateLimit } from "./middleware/rate-limit.middleware.js"
import {
  errorMiddleware,
  notFoundHandler,
} from "./middleware/error.middleware.js"
import { requestContext } from "./middleware/request-context.middleware.js"
import swaggerUi from "swagger-ui-express"

import { openApiDocument } from "./config/openapi.js"
import { healthRouter } from "./modules/health/health.routes.js"
import { apiRouter } from "./routes/index.js"

/**
 * Builds the Express application without binding a port, so integration tests
 * can drive it through Supertest and `server.ts` can own the listener.
 */
export function createApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  // Behind the Vite dev proxy (and any future reverse proxy) the client IP the
  // rate limiter and audit log need arrives via X-Forwarded-For.
  app.set("trust proxy", 1)

  app.use(requestContext)

  app.use(
    helmet({
      // The API serves JSON; Swagger UI needs inline styles/scripts to render.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  )

  app.use(
    cors({
      // Explicit allowlist. A wildcard is never combined with credentials.
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true)
          return
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS policy`))
      },
      credentials: true,
      exposedHeaders: ["x-request-id"],
    })
  )

  app.use(express.json({ limit: "1mb" }))
  app.use(express.urlencoded({ extended: false, limit: "1mb" }))

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) =>
          (req as { requestId?: string }).requestId ?? randomUUID(),
        autoLogging: {
          ignore: (req) => req.url?.startsWith("/health") ?? false,
        },
      })
    )
  }

  // Health endpoints sit outside the versioned prefix and outside rate limits
  // so an orchestrator probe can never be throttled.
  app.use(healthRouter)

  // Swagger UI is mounted before the rate limiter so browsing the docs cannot
  // exhaust an operator's API budget.
  app.use(
    `${API_PREFIX}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "SCS-RG API",
      swaggerOptions: { persistAuthorization: true },
    })
  )
  app.get(`${API_PREFIX}/openapi.json`, (_req, res) => {
    res.json(openApiDocument)
  })

  // Ingestion is excluded from the dashboard API budget: it has its own,
  // far wider, per-zone limiter. Sharing one 300/min bucket across every
  // sensor node would throttle the system's busiest path.
  app.use(API_PREFIX, (req, res, next) => {
    if (req.path.startsWith("/ingestion/")) {
      next()
      return
    }
    apiRateLimit(req, res, next)
  })
  app.use(API_PREFIX, apiRouter)

  app.use(notFoundHandler)
  app.use(errorMiddleware)

  return app
}
