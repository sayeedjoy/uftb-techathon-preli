/**
 * Scenario 11 — sustained load harness.
 *
 *   pnpm sim:load -- --zones 30 --hz 5 --seconds 20
 *
 * Creates the extra zones it needs through the admin API (so they are real
 * zones with real credentials), drives them at the requested rate through the
 * real ingestion endpoint, then reconciles submitted against accepted counts.
 * Any discrepancy is a lost or duplicated reading and fails the run.
 */
import { env } from "../src/config/env.js"
import { DEV_USERS } from "../prisma/seeds/users.seed.js"

type Args = { zones: number; hz: number; seconds: number }

function parseArgs(argv: string[]): Args {
  const read = (flag: string, fallback: number) => {
    const index = argv.indexOf(flag)
    if (index === -1) return fallback
    const value = Number(argv[index + 1])
    return Number.isFinite(value) ? value : fallback
  }
  return {
    zones: read("--zones", 30),
    hz: read("--hz", 5),
    seconds: read("--seconds", 20),
  }
}

const BASE = env.SIM_INGESTION_BASE_URL

async function login(): Promise<string> {
  const admin = DEV_USERS.find((user) => user.role === "ADMIN")
  if (!admin) throw new Error("No seeded admin account is defined.")

  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  })
  if (!response.ok) {
    throw new Error(
      `Login failed (HTTP ${response.status}). Is the backend running?`
    )
  }
  const body = (await response.json()) as { data: { token: string } }
  return body.data.token
}

type LoadZone = { id: string; code: string; apiKey: string }

async function ensureZones(token: string, count: number): Promise<LoadZone[]> {
  const zones: LoadZone[] = []

  for (let i = 0; i < count; i += 1) {
    const code = `load-zone-${String(i + 1).padStart(2, "0")}`
    const response = await fetch(`${BASE}/admin/zones`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code,
        name: `Load Zone ${i + 1}`,
        assetImportance: i % 9,
        sensors: [
          { type: "FLAME", name: "Flame detector", isCritical: true },
          { type: "GAS", name: "Gas sensor", isCritical: false },
          { type: "OCCUPANCY", name: "Occupancy sensor", isCritical: false },
        ],
      }),
    })

    if (response.status === 201) {
      const body = (await response.json()) as {
        data: { zone: { id: string; code: string }; apiKey: string }
      }
      zones.push({
        id: body.data.zone.id,
        code: body.data.zone.code,
        apiKey: body.data.apiKey,
      })
    } else if (response.status === 409) {
      // Left over from a previous run: rotate a fresh key rather than giving
      // up, so the harness is idempotent against an existing database.
      const rotated = await fetch(`${BASE}/admin/zones/${code}/credentials`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      })

      if (rotated.status === 201) {
        const body = (await rotated.json()) as {
          data: { zone: { id: string; code: string }; apiKey: string }
        }
        zones.push({
          id: body.data.zone.id,
          code: body.data.zone.code,
          apiKey: body.data.apiKey,
        })
        // Reactivate in case an earlier run parked it.
        await fetch(`${BASE}/admin/zones/${code}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: true }),
        })
      } else {
        console.warn(`  could not reuse ${code} (HTTP ${rotated.status})`)
      }
    } else {
      throw new Error(`Could not create ${code} (HTTP ${response.status})`)
    }
  }

  return zones
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const token = await login()

  console.log(`\nPreparing ${args.zones} load zones…`)
  const zones = await ensureZones(token, args.zones)

  if (zones.length === 0) {
    console.error(
      "\nNo usable load zones. Run `pnpm db:reset && pnpm db:seed` first.\n"
    )
    process.exit(1)
  }

  console.log(
    `Driving ${zones.length} zones at ${args.hz} Hz for ${args.seconds}s…\n`
  )

  let submitted = 0
  let accepted = 0
  let rejected = 0
  const rejections = new Map<number, number>()

  const intervalMs = Math.max(1, Math.round(1000 / args.hz))
  const started = Date.now()
  const deadline = started + args.seconds * 1000

  /**
   * One self-paced loop per zone.
   *
   * A real sensor node waits for its own response before sending again. Firing
   * on a fixed timer regardless of completion would queue requests without
   * bound and exhaust sockets, which measures the harness rather than the
   * backend.
   */
  // Sequence numbers are unique per zone for all time, so a re-run must not
  // restart at 1 — it would collide with the previous run and be rejected as a
  // duplicate, which is the constraint working correctly.
  const sequenceBase = Math.floor(Date.now() / 1000)

  async function driveZone(zone: LoadZone): Promise<void> {
    let sequence = sequenceBase

    while (Date.now() < deadline) {
      const sentAt = Date.now()
      sequence += 1
      submitted += 1

      try {
        const response = await fetch(
          `${BASE}/ingestion/zones/${zone.id}/readings`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-zone-api-key": zone.apiKey,
            },
            body: JSON.stringify({
              readingId: `${zone.code}-${sequence}`,
              sequenceNumber: sequence,
              capturedAt: new Date().toISOString(),
              sensors: {
                fireDetected: false,
                gasLevel: Math.round(Math.random() * 30) / 100,
                occupancyDetected: Math.random() > 0.5,
              },
            }),
          }
        )

        if (response.ok) accepted += 1
        else {
          rejected += 1
          rejections.set(
            response.status,
            (rejections.get(response.status) ?? 0) + 1
          )
        }
        await response.arrayBuffer()
      } catch {
        rejected += 1
        rejections.set(0, (rejections.get(0) ?? 0) + 1)
      }

      const remaining = intervalMs - (Date.now() - sentAt)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }
    }
  }

  await Promise.all(zones.map(driveZone))

  const elapsedS = (Date.now() - started) / 1000
  const unaccounted = submitted - accepted - rejected

  console.log(`  submitted:   ${submitted}`)
  console.log(`  accepted:    ${accepted}`)
  console.log(`  rejected:    ${rejected}`)
  for (const [status, count] of rejections) {
    console.log(`     HTTP ${status || "network error"}: ${count}`)
  }
  console.log(`  unaccounted: ${unaccounted}`)
  console.log(
    `  throughput:  ${(accepted / elapsedS).toFixed(1)} accepted readings/s over ${elapsedS.toFixed(1)}s\n`
  )

  if (unaccounted !== 0 || rejected !== 0) {
    console.error(
      "✗ Reconciliation failed: every submitted reading must be either accepted or explicitly rejected, and a clean load run should have no rejections.\n"
    )
    process.exit(1)
  }

  console.log("✓ No lost or duplicated accepted readings.\n")

  // Park the synthetic zones so they do not clutter the demo dashboard.
  // Deactivation, never deletion — they now have readings referencing them.
  await Promise.all(
    zones.map((zone) =>
      fetch(`${BASE}/admin/zones/${zone.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: false }),
      }).catch(() => undefined)
    )
  )
  console.log(`  (${zones.length} load zones deactivated)\n`)
}

main().catch((error: unknown) => {
  console.error("Load run failed:", error)
  process.exit(1)
})
