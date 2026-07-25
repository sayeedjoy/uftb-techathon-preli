import { PrismaClient } from "@prisma/client"

import { databaseUrl, env, isProduction, isTest } from "../config/env.js"
import { logger } from "../config/logger.js"

/**
 * One Prisma client for the whole process.
 *
 * The pool size is explicit because the 30-zone load scenario drives ~150
 * per-reading transactions per second (plan risk R7); leaving it to Prisma's
 * default makes the failure mode a mystery timeout rather than a config knob.
 */
function buildConnectionUrl(): string {
  try {
    const url = new URL(databaseUrl)
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(env.DATABASE_POOL_SIZE))
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20")
    }
    return url.toString()
  } catch {
    // A non-URL DSN (rare, but possible) is passed through untouched.
    return databaseUrl
  }
}

function createClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: buildConnectionUrl() } },
    log: isProduction || isTest ? ["error"] : ["warn", "error"],
  })
}

// `tsx watch` re-evaluates modules on every save; without this the process
// accumulates a new pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  __scsrgPrisma?: PrismaClient
}

export const prisma: PrismaClient =
  globalForPrisma.__scsrgPrisma ?? createClient()

if (!isProduction) {
  globalForPrisma.__scsrgPrisma = prisma
}

export type Database = typeof prisma

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
  logger.info("Database connection established")
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}

export async function checkDatabase(): Promise<{
  connected: boolean
  latencyMs: number | null
}> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { connected: true, latencyMs: Date.now() - start }
  } catch (error) {
    logger.error({ err: error }, "Database health check failed")
    return { connected: false, latencyMs: null }
  }
}
