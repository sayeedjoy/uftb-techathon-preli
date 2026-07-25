import type { ZoneCredential } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

/** Only non-revoked credentials are ever candidates for a match. */
export function findActiveCredentials(
  zoneId: string,
  db: DbHandle = prisma
): Promise<ZoneCredential[]> {
  return db.zoneCredential.findMany({
    where: { zoneId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  })
}

export function markCredentialUsed(
  credentialId: string,
  at: Date,
  db: DbHandle = prisma
): Promise<ZoneCredential> {
  return db.zoneCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: at },
  })
}

export function revokeCredentials(
  zoneId: string,
  db: DbHandle = prisma
) {
  return db.zoneCredential.updateMany({
    where: { zoneId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export function createCredential(
  zoneId: string,
  apiKeyHash: string,
  label: string,
  db: DbHandle = prisma
): Promise<ZoneCredential> {
  return db.zoneCredential.create({
    data: { zoneId, apiKeyHash, label },
  })
}
