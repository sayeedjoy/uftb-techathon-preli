/**
 * Performance gate.
 *
 *   pnpm db:explain
 *
 * Runs EXPLAIN ANALYZE on the hot query — "all CRITICAL or active incidents
 * from the last 24 hours across all zones" — and **exits non-zero** on a
 * sequential scan or a runtime above the budget. A gate that only prints is not
 * a gate: dropping the index has to break the build.
 */
import { PrismaClient } from "@prisma/client"

// Side effect: loads backend/.env and validates the configuration, so a
// script fails the same way the server would rather than on a missing DSN.
import "../src/config/env.js"

const prisma = new PrismaClient()

const MAX_DURATION_MS = 50

const HOT_QUERY = `
  SELECT i.id, i."zoneId", i.status, i."startedAt", i."maximumRiskScore"
  FROM "Incident" i
  WHERE i.status IN ('OPEN', 'ACKNOWLEDGED')
     OR i."createdAt" >= now() - interval '24 hours'
  ORDER BY i."createdAt" DESC
  LIMIT 200
`

type ExplainRow = { "QUERY PLAN": string }

async function main(): Promise<void> {
  const readings = await prisma.sensorReading.count()
  const incidents = await prisma.incident.count()

  console.log(
    `\nExplaining the 24-hour incident query against ${readings} readings and ${incidents} incidents.\n`
  )

  if (readings < 10_000) {
    console.warn(
      `  ⚠  Only ${readings} readings present. Run \`pnpm db:seed:load\` for a meaningful measurement.\n`
    )
  }

  // ANALYZE actually executes the query, so the timing is real, not estimated.
  const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${HOT_QUERY}`
  )
  const plan = rows.map((row) => row["QUERY PLAN"]).join("\n")

  console.log(plan)
  console.log("")

  const executionMatch = /Execution Time: ([\d.]+) ms/.exec(plan)
  const durationMs = executionMatch ? Number(executionMatch[1]) : Number.NaN

  // A sequential scan on Incident is the failure this gate exists to catch.
  const usesSeqScan = /Seq Scan on "?Incident"?/i.test(plan)
  const indexMatch = /Index (?:Only )?Scan[^\n]*using ([\w".]+)/i.exec(plan)
  const bitmapMatch = /Bitmap Index Scan on ([\w".]+)/i.exec(plan)
  const indexName = indexMatch?.[1] ?? bitmapMatch?.[1] ?? null

  const failures: string[] = []

  if (usesSeqScan) {
    failures.push(
      'The planner chose a sequential scan on "Incident". The expected index is incident_status_created_at_desc / Incident_status_createdAt_idx.'
    )
  }

  if (!indexName && !usesSeqScan) {
    failures.push("No index scan appeared in the plan.")
  }

  if (Number.isFinite(durationMs) && durationMs > MAX_DURATION_MS) {
    failures.push(
      `Execution took ${durationMs.toFixed(2)} ms, above the ${MAX_DURATION_MS} ms budget.`
    )
  }

  if (indexName) console.log(`  Index used:     ${indexName}`)
  if (Number.isFinite(durationMs)) {
    console.log(
      `  Execution time: ${durationMs.toFixed(2)} ms (budget ${MAX_DURATION_MS} ms)`
    )
  }

  if (failures.length > 0) {
    console.error("\n✗ Performance gate failed:")
    for (const failure of failures) console.error(`   · ${failure}`)
    console.error("")
    process.exit(1)
  }

  console.log("\n✓ Performance gate passed.\n")
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error("Explain failed:", error)
    await prisma.$disconnect()
    process.exit(1)
  })
