import type { Prisma, Zone } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import { hashApiKey } from "../../modules/auth/password.util.js"
import { newApiKey } from "../../shared/id.js"

let zoneCounter = 0

export type SeededZone = {
  zone: Zone
  apiKey: string
}

/**
 * Creates a zone with sensors and a usable API key.
 * The plaintext key is returned so ingestion tests can authenticate for real
 * rather than bypassing the middleware.
 */
export async function createZoneFixture(
  overrides: Partial<Prisma.ZoneCreateInput> & {
    sensorTypes?: Array<"FLAME" | "GAS" | "WATER" | "OCCUPANCY">
  } = {}
): Promise<SeededZone> {
  zoneCounter += 1
  const { sensorTypes = ["FLAME", "GAS", "OCCUPANCY"], ...zoneOverrides } =
    overrides

  const zone = await prisma.zone.create({
    data: {
      code: `test-zone-${zoneCounter}`,
      name: `Test Zone ${zoneCounter}`,
      assetImportance: 5,
      // A zone that has never reported is OFFLINE, not SAFE — same as the seed.
      state: "OFFLINE",
      isActive: true,
      ...zoneOverrides,
      sensors: {
        create: sensorTypes.map((type) => ({
          type,
          name: `${type} sensor`,
          isCritical: type === "FLAME",
          status: "ONLINE",
        })),
      },
    },
  })

  const apiKey = newApiKey("test")
  await prisma.zoneCredential.create({
    data: {
      zoneId: zone.id,
      apiKeyHash: await hashApiKey(apiKey),
      label: "test",
    },
  })

  return { zone, apiKey }
}

export async function createIncidentFixture(
  zoneId: string,
  overrides: Partial<Prisma.IncidentUncheckedCreateInput> = {}
) {
  return prisma.incident.create({
    data: {
      zoneId,
      status: "OPEN",
      maximumRiskScore: 80,
      currentRiskScore: 80,
      dominantHazards: ["FIRE"],
      ...overrides,
    },
  })
}
