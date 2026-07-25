/**
 * Bulk history generator.
 *
 *   pnpm db:seed:load                 # top up to 10 000+ readings
 *   pnpm db:seed:load -- --readings 40000 --incidents 400
 *
 * The performance gate (`pnpm db:explain`) is only meaningful with real data
 * volume behind it, so this exists to produce that volume quickly.
 */
import { PrismaClient, type Prisma } from "@prisma/client"

// Side effect: loads backend/.env and validates the configuration, so a
// script fails the same way the server would rather than on a missing DSN.
import "../src/config/env.js"

import { riskConfig } from "../src/config/risk.config.js"
import {
  computeRisk,
  dominantHazards,
} from "../src/modules/risk-engine/risk.service.js"

const prisma = new PrismaClient()

type Args = { readings: number; incidents: number; days: number; seed: number }

function parseArgs(argv: string[]): Args {
  const read = (flag: string, fallback: number) => {
    const index = argv.indexOf(flag)
    if (index === -1) return fallback
    const value = Number(argv[index + 1])
    return Number.isFinite(value) ? value : fallback
  }

  return {
    readings: read("--readings", 12_000),
    incidents: read("--incidents", 220),
    days: read("--days", 7),
    seed: read("--seed", 424_242),
  }
}

function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const random = createRandom(args.seed)

  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    include: { sensors: true },
    orderBy: { code: "asc" },
  })

  if (zones.length === 0) {
    console.error("No zones found. Run `pnpm db:seed` first.")
    process.exit(1)
  }

  const now = Date.now()
  const windowMs = args.days * 24 * 60 * 60 * 1000
  const perZone = Math.ceil(args.readings / zones.length)

  console.log(
    `\nGenerating ~${perZone * zones.length} readings and ${args.incidents} incidents across ${zones.length} zones…\n`
  )

  for (const zone of zones) {
    const types = new Set(zone.sensors.map((sensor) => sensor.type))
    const existing = await prisma.sensorReading.count({
      where: { zoneId: zone.id },
    })

    const rows: Prisma.SensorReadingCreateManyInput[] = []
    for (let i = 0; i < perZone; i += 1) {
      const sequenceNumber = existing + 100_000 + i
      const capturedAt = new Date(
        now - windowMs + Math.floor((i / perZone) * windowMs)
      )

      const spike = random() < 0.08
      const fireDetected = types.has("FLAME") ? spike && random() < 0.35 : null
      const gasLevel = types.has("GAS")
        ? round2(spike ? 0.4 + random() * 0.55 : random() * 0.25)
        : null
      const waterLevel = types.has("WATER")
        ? round2(spike ? 0.3 + random() * 0.6 : random() * 0.12)
        : null
      const occupancyDetected = types.has("OCCUPANCY") ? random() < 0.5 : null

      const computation = computeRisk(
        {
          fireSignal: fireDetected ? 1 : 0,
          normalizedGasLevel: gasLevel ?? 0,
          normalizedWaterLevel: waterLevel ?? 0,
          occupancyFactor: occupancyDetected ? 1 : 0,
        },
        riskConfig
      )

      rows.push({
        readingId: `${zone.code}-load-${sequenceNumber}`,
        zoneId: zone.id,
        sequenceNumber,
        capturedAt,
        receivedAt: capturedAt,
        fireDetected,
        gasLevel,
        waterLevel,
        occupancyDetected,
        sensorHealth: {},
        riskScore: computation.riskScore,
        calculatedState: computation.state,
        contributions:
          computation.contributions as unknown as Prisma.InputJsonValue,
        reasons: computation.reasons as unknown as Prisma.InputJsonValue,
        isDuplicate: false,
        validationStatus: "ACCEPTED",
      })
    }

    for (let offset = 0; offset < rows.length; offset += 1_000) {
      await prisma.sensorReading.createMany({
        data: rows.slice(offset, offset + 1_000),
        skipDuplicates: true,
      })
    }
    console.log(`  • ${rows.length} readings for ${zone.code}`)
  }

  // Resolved incidents only: the partial unique index permits at most one
  // active incident per zone, and inventing more would violate the model.
  const incidentRows: Prisma.IncidentCreateManyInput[] = []
  for (let i = 0; i < args.incidents; i += 1) {
    const zone = zones[i % zones.length]
    if (!zone) continue

    const startedAt = new Date(now - Math.floor(random() * windowMs))
    const peak = round2(66 + random() * 33)
    const contributions = {
      fire: 40,
      gas: round2(peak - 55),
      water: 0,
      occupancy: 15,
    }

    incidentRows.push({
      zoneId: zone.id,
      status: "RESOLVED",
      startedAt,
      resolvedAt: new Date(startedAt.getTime() + (2 + random() * 25) * 60_000),
      maximumRiskScore: peak,
      currentRiskScore: round2(random() * 20),
      dominantHazards: dominantHazards(contributions),
      priorityScore: round2(peak + zone.assetImportance),
      createdAt: startedAt,
    })
  }

  for (let offset = 0; offset < incidentRows.length; offset += 500) {
    await prisma.incident.createMany({
      data: incidentRows.slice(offset, offset + 500),
      skipDuplicates: true,
    })
  }

  const [readingTotal, incidentTotal] = await Promise.all([
    prisma.sensorReading.count(),
    prisma.incident.count(),
  ])

  console.log(
    `\n✓ Database now holds ${readingTotal} readings and ${incidentTotal} incidents.\n`
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error("Load generation failed:", error)
    await prisma.$disconnect()
    process.exit(1)
  })
