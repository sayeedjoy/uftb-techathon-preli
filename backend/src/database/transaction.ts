import type { Prisma } from "@prisma/client"

import { prisma } from "./prisma.js"

/**
 * A handle every repository accepts: either the root client or an open
 * transaction. Repositories are written against this type so a service can
 * compose them inside one atomic unit without duplicating query code.
 */
export type PrismaTx = Prisma.TransactionClient
export type DbHandle = PrismaTx | typeof prisma

export type TransactionOptions = {
  /** Milliseconds the interactive transaction may run before rollback. */
  timeoutMs?: number
  maxWaitMs?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
}

/**
 * Runs `fn` inside one database transaction.
 *
 * Ingestion steps 9–14 (persist → live state → transition → incident →
 * actuation → priority) all run through here, so a crash can never leave a
 * reading stored without its state transition, or an incident open without its
 * timeline row. Nothing that performs network I/O may run inside the callback —
 * broadcasts happen after commit.
 */
export function withTransaction<T>(
  fn: (tx: PrismaTx) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  return prisma.$transaction(fn, {
    timeout: options.timeoutMs ?? 15_000,
    maxWait: options.maxWaitMs ?? 10_000,
    ...(options.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : {}),
  })
}
