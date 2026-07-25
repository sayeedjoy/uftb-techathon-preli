import { createServer } from "node:http"

import { logAiProviderChain } from "./ai/index.js"
import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { disconnectDatabase } from "./database/prisma.js"
import {
  runBootstrap,
  stopBackgroundJobs,
} from "./bootstrap/bootstrap.service.js"
import {
  createSocketServer,
  closeSocketServer,
} from "./realtime/socket-server.js"

/**
 * Startup order matters: state is fully reconstructed from Postgres *before*
 * the listener binds, so the first request a client makes already sees the
 * correct picture. The backend never assumes zones are SAFE after a restart.
 */
async function main(): Promise<void> {
  const app = createApp()
  const httpServer = createServer(app)

  createSocketServer(httpServer)

  await runBootstrap()
  logAiProviderChain()

  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `SCS-RG backend listening on http://localhost:${env.PORT}`
    )
  })

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, "Shutting down")

    stopBackgroundJobs()

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out; forcing exit")
      process.exit(1)
    }, 10_000)
    forceExit.unref()

    httpServer.close(() => {
      void (async () => {
        await closeSocketServer()
        await disconnectDatabase()
        clearTimeout(forceExit)
        logger.info("Shutdown complete")
        process.exit(0)
      })()
    })
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection")
  })
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception — exiting")
    process.exit(1)
  })
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Backend failed to start")
  process.exit(1)
})
