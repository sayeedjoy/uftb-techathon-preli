/**
 * Data-retention job.
 *
 *   pnpm --filter backend retention              # dry run (default)
 *   pnpm --filter backend retention -- --apply   # actually purge
 *
 * Policy (docs/data-retention.md): raw readings are kept for 90 days, then
 * rolled into hourly aggregates and deleted. Incident records and their
 * timelines are kept far longer — they are the audit trail.
 *
 * Dry-run by default and **not scheduled**: deleting history should be a
 * deliberate act, not something a prototype does to itself overnight.
 */
import { PrismaClient } from "@prisma/client"

// Side effect: loads backend/.env and validates the configuration, so a
// script fails the same way the server would rather than on a missing DSN.
import "../src/config/env.js"

const prisma = new PrismaClient()

const RETENTION_DAYS = 90

type HourlyBucket = {
  zoneId: string
  hour: Date
  readings: bigint
  avgRisk: number
  maxRisk: number
  avgGas: number | null
  avgWater: number | null
  fireReadings: bigint
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  console.log(
    `\nRetention policy: raw readings older than ${RETENTION_DAYS} days (before ${cutoff.toISOString()})`
  )
  console.log(apply ? "Mode: APPLY (rows will be deleted)\n" : "Mode: DRY RUN\n")

  const doomed = await prisma.sensorReading.count({
    where: { capturedAt: { lt: cutoff } },
  })
  console.log(`  readings eligible for aggregation: ${doomed}`)

  if (doomed === 0) {
    console.log("\n✓ Nothing to do.\n")
    return
  }

  const buckets = await prisma.$queryRaw<HourlyBucket[]>`
    SELECT
      "zoneId",
      date_trunc('hour', "capturedAt") AS hour,
      count(*)                          AS readings,
      avg("riskScore")                  AS "avgRisk",
      max("riskScore")                  AS "maxRisk",
      avg("gasLevel")                   AS "avgGas",
      avg("waterLevel")                 AS "avgWater",
      count(*) FILTER (WHERE "fireDetected") AS "fireReadings"
    FROM "SensorReading"
    WHERE "capturedAt" < ${cutoff}
    GROUP BY "zoneId", date_trunc('hour', "capturedAt")
  `

  console.log(`  hourly aggregate rows to write:    ${buckets.length}`)

  if (!apply) {
    console.log(
      "\n✓ Dry run complete. Re-run with `-- --apply` to write aggregates and purge.\n"
    )
    return
  }

  for (const bucket of buckets) {
    await prisma.readingHourlyAggregate.upsert({
      where: { zoneId_hour: { zoneId: bucket.zoneId, hour: bucket.hour } },
      update: {
        readings: Number(bucket.readings),
        avgRisk: bucket.avgRisk,
        maxRisk: bucket.maxRisk,
        avgGas: bucket.avgGas,
        avgWater: bucket.avgWater,
        fireReadings: Number(bucket.fireReadings),
      },
      create: {
        zoneId: bucket.zoneId,
        hour: bucket.hour,
        readings: Number(bucket.readings),
        avgRisk: bucket.avgRisk,
        maxRisk: bucket.maxRisk,
        avgGas: bucket.avgGas,
        avgWater: bucket.avgWater,
        fireReadings: Number(bucket.fireReadings),
      },
    })
  }

  const deleted = await prisma.sensorReading.deleteMany({
    where: { capturedAt: { lt: cutoff } },
  })

  console.log(
    `\n✓ Wrote ${buckets.length} aggregates and purged ${deleted.count} raw readings.`
  )
  console.log("  Incidents and their timelines are untouched.\n")
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error("Retention job failed:", error)
    await prisma.$disconnect()
    process.exit(1)
  })
