import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { requireAdmin } from "../../middleware/authorization.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import {
  injectFaultController,
  patchStateController,
  runScenarioController,
  startController,
  statusController,
  stopAllController,
  stopController,
} from "./simulator.controller.js"

export const simulatorRouter: Router = Router()

// Admin-only: the simulator can drive the whole campus into CRITICAL.
simulatorRouter.use(requireAuthentication, requireAdmin)

simulatorRouter.get("/status", asyncHandler(statusController))
simulatorRouter.post("/zones/:zoneId/start", asyncHandler(startController))
simulatorRouter.post("/zones/:zoneId/stop", asyncHandler(stopController))
simulatorRouter.patch(
  "/zones/:zoneId/state",
  asyncHandler(patchStateController)
)
simulatorRouter.post(
  "/zones/:zoneId/fault",
  asyncHandler(injectFaultController)
)
simulatorRouter.post("/stop-all", asyncHandler(stopAllController))
simulatorRouter.post(
  "/scenarios/:scenarioId/run",
  asyncHandler(runScenarioController)
)
