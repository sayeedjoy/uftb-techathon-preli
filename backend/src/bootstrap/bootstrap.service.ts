import { logger } from "../config/logger.js"
import { connectDatabase } from "../database/prisma.js"

/**
 * The eight-step startup sequence (spec §9.11). Every step runs *before* the
 * HTTP listener binds, so the first client request already sees reconstructed
 * state. The backend never assumes zones are SAFE after a restart.
 *
 * Steps 2–7 are filled in by the state-reconstruction service once the zone,
 * incident and priority modules exist; the ordering contract lives here.
 */
export async function runBootstrap(): Promise<void> {
  const startedAt = Date.now()

  // 1. Connect to Postgres — fail fast rather than serving degraded.
  try {
    await connectDatabase()
  } catch (error) {
    logger.fatal(
      { err: error },
      "Could not connect to the database. Is `pnpm db:up` running?"
    )
    process.exit(1)
  }

  // 2–7. Reconstruct live state, rehydrate in-memory counters, restart jobs.
  const { reconstructState } = await import(
    "./state-reconstruction.service.js"
  )
  const summary = await reconstructState()

  logger.info(
    { ...summary, durationMs: Date.now() - startedAt },
    "State reconstruction complete"
  )
}

/** Called from the SIGTERM path so timers cannot keep the process alive. */
export function stopBackgroundJobs(): void {
  void (async () => {
    const { stopHeartbeatMonitor } = await import(
      "../jobs/heartbeat-monitor.js"
    )
    stopHeartbeatMonitor()
  })()
}
