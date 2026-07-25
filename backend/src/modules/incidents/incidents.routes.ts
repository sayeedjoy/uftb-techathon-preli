import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import {
  acknowledgeIncidentController,
  getIncidentController,
  getIncidentTimelineController,
  listIncidentsController,
} from "./incidents.controller.js"

export const incidentsRouter: Router = Router()

incidentsRouter.use(requireAuthentication)

incidentsRouter.get("/", asyncHandler(listIncidentsController))
incidentsRouter.get("/:incidentId", asyncHandler(getIncidentController))
incidentsRouter.get(
  "/:incidentId/timeline",
  asyncHandler(getIncidentTimelineController)
)
// Both roles may acknowledge — it is the core security-staff action.
incidentsRouter.post(
  "/:incidentId/acknowledge",
  asyncHandler(acknowledgeIncidentController)
)
