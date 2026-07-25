import type { PrismaClient, Prisma, ZoneState } from "@prisma/client"

import { computeRisk, dominantHazards } from "../../src/modules/risk-engine/risk.service.js"
import { riskConfig } from "../../src/config/risk.config.js"

/**
 * Deterministic pseudo-random source.
 *
 * A fixed seed means the demo data is identical on every machine, so a judge
 * and the developer are looking at the same numbers.
 */
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

export type HistoryOptions = {
  readingsPerZone?: number
  days?: number
  resolvedIncidentsPerZone?: number
  seed?: number
}

/**
 * Seeds historical readings, resolved incidents with full timelines, exactly
 * one acknowledged incident, audit logs and system events.
 *
 * Volume matters: the indexed 24-hour incident query is only meaningful as a
 * performance gate once there are ≥ 10 000 readings behind it.
 */
export async function seedHistory(
  prisma: PrismaClient,
  options: HistoryOptions = {}
): Promise<void> {
  const {
    readingsPerZone = 3_500,
    days = 7,
    resolvedIncidentsPerZone = 2,
    seed = 20260725,
  } = options

  const random = createRandom(seed)
  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    include: { sensors: true },
    orderBy: { code: "asc" },
  })

  if (zones.length === 0) {
    console.log("  • no zones found — skipping history")
    return
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
  const securityUser =
    users.find((user) => user.role === "SECURITY_STAFF") ?? users[0]
  const adminUser = users.find((user) => user.role === "ADMIN") ?? users[0]

  const now = Date.now()
  const windowMs = days * 24 * 60 * 60 * 1000
  const existing = await prisma.sensorReading.count()

  if (existing >= readingsPerZone * zones.length) {
    console.log(`  • ${existing} readings already present — skipping`)
  } else {
    for (const zone of zones) {
      const sensorTypes = new Set(zone.sensors.map((sensor) => sensor.type))
      const rows: Prisma.SensorReadingCreateManyInput[] = []

      for (let i = 0; i < readingsPerZone; i += 1) {
        const capturedAt = new Date(
          now - windowMs + Math.floor((i / readingsPerZone) * windowMs)
        )

        // Mostly calm with occasional excursions, so the charts have shape.
        const excursion = random() < 0.06
        const fireDetected = sensorTypes.has("FLAME")
          ? excursion && random() < 0.3
          : null
        const gasLevel = sensorTypes.has("GAS")
          ? round2(excursion ? 0.35 + random() * 0.6 : random() * 0.2)
          : null
        const waterLevel = sensorTypes.has("WATER")
          ? round2(excursion ? 0.3 + random() * 0.6 : random() * 0.1)
          : null
        const occupancyDetected = sensorTypes.has("OCCUPANCY")
          ? random() < 0.55
          : null

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
          readingId: `${zone.code}-hist-${i}`,
          zoneId: zone.id,
          sequenceNumber: i,
          capturedAt,
          receivedAt: capturedAt,
          fireDetected,
          gasLevel,
          waterLevel,
          occupancyDetected,
          sensorHealth: {},
          riskScore: computation.riskScore,
          calculatedState: computation.state as ZoneState,
          contributions: computation.contributions as unknown as Prisma.InputJsonValue,
          reasons: computation.reasons as unknown as Prisma.InputJsonValue,
          isDuplicate: false,
          validationStatus: "ACCEPTED",
        })
      }

      // Chunked so a 10k-row insert does not exceed the parameter limit.
      for (let offset = 0; offset < rows.length; offset += 1_000) {
        await prisma.sensorReading.createMany({
          data: rows.slice(offset, offset + 1_000),
          skipDuplicates: true,
        })
      }

      console.log(`  • ${rows.length} readings for ${zone.code}`)
    }
  }

  // --- Resolved incidents with complete timelines ---------------------------
  const existingIncidents = await prisma.incident.count()
  if (existingIncidents > 0) {
    console.log(`  • ${existingIncidents} incidents already present — skipping`)
    return
  }

  let acknowledgedSeeded = false

  for (const [zoneIndex, zone] of zones.entries()) {
    for (let i = 0; i < resolvedIncidentsPerZone; i += 1) {
      const startedAt = new Date(
        now - windowMs + (zoneIndex + 1) * 3 * 60 * 60 * 1000 + i * 9 * 60 * 60 * 1000
      )
      const resolvedAt = new Date(startedAt.getTime() + (4 + random() * 20) * 60_000)
      const peak = round2(68 + random() * 30)

      const contributions = {
        fire: 40,
        gas: round2(peak - 40 - 15),
        water: 0,
        occupancy: 15,
      }

      const incident = await prisma.incident.create({
        data: {
          zoneId: zone.id,
          status: "RESOLVED",
          startedAt,
          resolvedAt,
          maximumRiskScore: peak,
          currentRiskScore: round2(12 + random() * 10),
          dominantHazards: dominantHazards(contributions),
          priorityScore: round2(peak + zone.assetImportance + 10),
          priorityExplanation: {
            priorityScore: round2(peak + zone.assetImportance + 10),
            breakdown: {
              risk: peak,
              occupancy: 10,
              duration: 6,
              asset: zone.assetImportance,
              multiHazard: 5,
              acknowledged: 0,
              humanReport: 0,
            },
            reasons: [
              `Live risk score ${peak}`,
              "Zone is occupied (+10)",
              `High-value zone, asset importance ${zone.assetImportance} (+${zone.assetImportance})`,
            ],
          } as unknown as Prisma.InputJsonValue,
        },
      })

      await prisma.incidentTimelineEvent.createMany({
        data: [
          {
            incidentId: incident.id,
            eventType: "CREATED",
            message: `Incident opened — zone entered CRITICAL at risk ${peak}`,
            createdAt: startedAt,
          },
          {
            incidentId: incident.id,
            eventType: "ACTUATION_ISSUED",
            message: "Actuation issued: SET_LED, ACTIVATE_BUZZER, ACTIVATE_RELAY",
            createdAt: new Date(startedAt.getTime() + 400),
          },
          {
            incidentId: incident.id,
            eventType: "RISK_UPDATED",
            message: `Risk moved ${round2(peak - 8)} → ${peak}`,
            createdAt: new Date(startedAt.getTime() + 45_000),
          },
          {
            incidentId: incident.id,
            eventType: "RESOLVED",
            message:
              "Hazard cleared — risk stayed below the recovery threshold for 3 consecutive readings.",
            createdAt: resolvedAt,
          },
        ],
      })

      await prisma.actuationCommand.createMany({
        data: [
          {
            zoneId: zone.id,
            incidentId: incident.id,
            type: "SET_LED",
            payload: { color: "RED" },
            source: "SENSOR_TRIGGERED",
            status: "COMPLETED",
            requestedAt: startedAt,
            executedAt: new Date(startedAt.getTime() + 120),
          },
          {
            zoneId: zone.id,
            incidentId: incident.id,
            type: "ACTIVATE_BUZZER",
            payload: { active: true },
            source: "SENSOR_TRIGGERED",
            status: "COMPLETED",
            requestedAt: startedAt,
            executedAt: new Date(startedAt.getTime() + 140),
          },
        ],
      })
    }

    // Exactly one acknowledged incident across the whole seed.
    if (!acknowledgedSeeded && securityUser) {
      const startedAt = new Date(now - 40 * 60_000)
      const acknowledgedAt = new Date(startedAt.getTime() + 90_000)

      const incident = await prisma.incident.create({
        data: {
          zoneId: zone.id,
          status: "ACKNOWLEDGED",
          startedAt,
          acknowledgedAt,
          maximumRiskScore: 82,
          currentRiskScore: 74,
          dominantHazards: ["FIRE", "GAS"],
          priorityScore: 92,
        },
      })

      await prisma.acknowledgment.create({
        data: {
          incidentId: incident.id,
          userId: securityUser.id,
          acknowledgedAt,
          note: "On my way — bringing the CO2 extinguisher.",
        },
      })

      await prisma.incidentTimelineEvent.createMany({
        data: [
          {
            incidentId: incident.id,
            eventType: "CREATED",
            message: "Incident opened — zone entered CRITICAL at risk 82",
            createdAt: startedAt,
          },
          {
            incidentId: incident.id,
            eventType: "ACKNOWLEDGED",
            message: `Acknowledged by ${securityUser.name}: On my way — bringing the CO2 extinguisher.`,
            createdAt: acknowledgedAt,
          },
        ],
      })

      acknowledgedSeeded = true
      console.log(`  • 1 acknowledged incident on ${zone.code}`)
    }
  }

  // --- Audit trail and system events ---------------------------------------
  if (adminUser && securityUser) {
    await prisma.auditLog.createMany({
      data: [
        {
          userId: adminUser.id,
          action: "OVERRIDE_TEST_ACTUATION",
          entityType: "Zone",
          entityId: zones[0]?.id ?? null,
          metadata: { reason: "Quarterly actuator self-test" },
          ipAddress: "127.0.0.1",
          createdAt: new Date(now - 26 * 60 * 60 * 1000),
        },
        {
          userId: securityUser.id,
          action: "INCIDENT_ACKNOWLEDGED",
          entityType: "Incident",
          metadata: { note: "Responded within 40 seconds" },
          ipAddress: "127.0.0.1",
          createdAt: new Date(now - 20 * 60 * 60 * 1000),
        },
        {
          userId: adminUser.id,
          action: "USER_ROLE_CHANGED",
          entityType: "User",
          entityId: securityUser.id,
          metadata: { from: "SECURITY_STAFF", to: "SECURITY_STAFF" },
          ipAddress: "127.0.0.1",
          createdAt: new Date(now - 3 * 60 * 60 * 1000),
        },
      ],
    })
  }

  await prisma.systemEvent.createMany({
    data: zones.flatMap((zone) => [
      {
        zoneId: zone.id,
        type: "ZONE_OFFLINE" as const,
        severity: "WARN" as const,
        message: `Zone ${zone.code} went offline (no data for 10s)`,
        createdAt: new Date(now - 18 * 60 * 60 * 1000),
      },
      {
        zoneId: zone.id,
        type: "VALIDATION_FAILURE" as const,
        severity: "WARN" as const,
        message: `Rejected reading for ${zone.code}: gas level above 1`,
        createdAt: new Date(now - 5 * 60 * 60 * 1000),
      },
    ]),
  })

  const totals = await Promise.all([
    prisma.sensorReading.count(),
    prisma.incident.count(),
  ])
  console.log(`  • totals: ${totals[0]} readings, ${totals[1]} incidents`)
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
