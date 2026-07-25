import { Router } from "express"

import { ingestionRateLimit } from "../../middleware/rate-limit.middleware.js"
import { requireZoneApiKey } from "../../middleware/zone-auth.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import {
  completeCommandController,
  heartbeatController,
  ingestReadingController,
  pullCommandsController,
} from "./ingestion.controller.js"

export const ingestionRouter: Router = Router()

// Every route below is reachable *only* with a zone API key for that zone.
// A dashboard JWT can never satisfy `requireZoneApiKey`.
ingestionRouter.use(ingestionRateLimit)

ingestionRouter.post(
  "/zones/:zoneId/readings",
  asyncHandler(requireZoneApiKey),
  asyncHandler(ingestReadingController)
)

ingestionRouter.post(
  "/zones/:zoneId/heartbeat",
  asyncHandler(requireZoneApiKey),
  asyncHandler(heartbeatController)
)

ingestionRouter.get(
  "/zones/:zoneId/commands",
  asyncHandler(requireZoneApiKey),
  asyncHandler(pullCommandsController)
)

ingestionRouter.post(
  "/zones/:zoneId/commands/:commandId/complete",
  asyncHandler(requireZoneApiKey),
  asyncHandler(completeCommandController)
)
