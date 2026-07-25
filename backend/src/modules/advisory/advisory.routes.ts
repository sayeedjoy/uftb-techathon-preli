import { Router } from "express"
import type { PredictionDto, TrendDto } from "@scsrg/shared"

import { env } from "../../config/env.js"
import { prisma } from "../../database/prisma.js"
import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { NotFoundError } from "../../shared/errors.js"
import { requiredPathParam } from "../../shared/params.js"
import { ok } from "../../shared/response.js"
import { computeTrend } from "../trend/trend.service.js"
import { predict } from "../prediction/prediction.service.js"

/**
 * Advisory endpoints for bonus 1 and bonus 2.
 *
 * Deliberately *outside* `modules/prediction`: that module must stay free of
 * any data-access import so the architecture test can prove a prediction has no
 * path to the database, to an incident, or to a relay. The HTTP layer lives
 * here instead, and only ever reads.
 */
export const advisoryRouter: Router = Router()

advisoryRouter.use(requireAuthentication)

async function loadZone(identifier: string) {
  const zone = await prisma.zone.findFirst({
    where: { OR: [{ id: identifier }, { code: identifier }] },
  })
  if (!zone) throw new NotFoundError("Zone not found.")
  return zone
}

advisoryRouter.get(
  "/trend/:zoneId",
  asyncHandler(async (req, res) => {
    const zone = await loadZone(requiredPathParam(req, "zoneId"))

    const readings = await prisma.sensorReading.findMany({
      where: { zoneId: zone.id, validationStatus: "ACCEPTED" },
      orderBy: { capturedAt: "desc" },
      take: env.TREND_WINDOW_READINGS,
      select: { riskScore: true, capturedAt: true },
    })

    const result = computeTrend(
      readings.reverse().map((reading) => ({
        riskScore: reading.riskScore,
        at: reading.capturedAt.getTime(),
      }))
    )

    const payload: TrendDto = {
      zoneId: zone.id,
      zoneCode: zone.code,
      trend: result.trend,
      slope: result.slope,
      movingAverage: result.movingAverage,
      samples: readings.map((reading) => reading.riskScore),
      updatedAt: new Date().toISOString(),
    }

    ok(res, payload)
  })
)

advisoryRouter.get(
  "/prediction/:zoneId",
  asyncHandler(async (req, res) => {
    if (!env.PREDICTION_ENABLED) {
      // Disabling the feature must change nothing else about the system.
      ok(res, { enabled: false })
      return
    }

    const zone = await loadZone(requiredPathParam(req, "zoneId"))

    const readings = await prisma.sensorReading.findMany({
      where: { zoneId: zone.id, validationStatus: "ACCEPTED" },
      orderBy: { capturedAt: "desc" },
      take: 20,
    })

    const ordered = [...readings].reverse()
    const oldest = ordered[0]
    const latest = ordered.at(-1)
    const spanSeconds =
      oldest && latest
        ? Math.max(
            1,
            (latest.capturedAt.getTime() - oldest.capturedAt.getTime()) / 1000
          )
        : 1

    const lastTransition = await prisma.zoneStateTransition.findFirst({
      where: { zoneId: zone.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })

    let fireStreak = 0
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (ordered[i]?.fireDetected === true) fireStreak += 1
      else break
    }

    const result = predict({
      currentRisk: zone.currentRiskScore,
      fireStreak,
      gasSlope:
        ((latest?.gasLevel ?? 0) - (oldest?.gasLevel ?? 0)) / spanSeconds,
      waterSlope:
        ((latest?.waterLevel ?? 0) - (oldest?.waterLevel ?? 0)) / spanSeconds,
      // Unknown occupancy counts as occupied here for the same fail-safe reason
      // the priority engine uses.
      occupancy: latest?.occupancyDetected === false ? 0 : 1,
      secondsSinceTransition: lastTransition
        ? (Date.now() - lastTransition.createdAt.getTime()) / 1000
        : 600,
      assetImportance: zone.assetImportance,
    })

    const payload: PredictionDto = {
      zoneId: zone.id,
      zoneCode: zone.code,
      probabilityCriticalWithin60s: result.probabilityCriticalWithin60s,
      confidence: result.confidence,
      featureContributions: result.featureContributions,
      modelVersion: result.modelVersion,
      predictedAt: new Date().toISOString(),
    }

    ok(res, payload)
  })
)
