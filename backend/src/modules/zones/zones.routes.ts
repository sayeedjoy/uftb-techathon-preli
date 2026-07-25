import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { requireAdmin } from "../../middleware/authorization.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { zoneSystemHealthController } from "../system-health/system-health.controller.js"
import {
  getZoneController,
  getZoneReadingsController,
  getZoneTimelineController,
  getZoneTransitionsController,
  listZonesController,
} from "./zones.controller.js"

export const zonesRouter: Router = Router()

zonesRouter.use(requireAuthentication)

zonesRouter.get("/", asyncHandler(listZonesController))
zonesRouter.get("/:zoneId", asyncHandler(getZoneController))
zonesRouter.get("/:zoneId/readings", asyncHandler(getZoneReadingsController))
zonesRouter.get("/:zoneId/timeline", asyncHandler(getZoneTimelineController))
zonesRouter.get(
  "/:zoneId/transitions",
  asyncHandler(getZoneTransitionsController)
)
zonesRouter.get(
  "/:zoneId/system-health",
  requireAdmin,
  asyncHandler(zoneSystemHealthController)
)
