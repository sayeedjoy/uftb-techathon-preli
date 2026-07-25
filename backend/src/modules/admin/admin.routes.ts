import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { requireAdmin } from "../../middleware/authorization.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { systemHealthController } from "../system-health/system-health.controller.js"
import {
  createZoneController,
  listAuditLogsController,
  listUsersController,
  overrideController,
  rotateZoneKeyController,
  updateSensorController,
  updateUserRoleController,
  updateZoneController,
} from "./admin.controller.js"

export const adminRouter: Router = Router()

// Backend-enforced RBAC. The frontend hiding these pages is not the mechanism:
// a direct call with a SECURITY_STAFF token gets 403 from here.
adminRouter.use(requireAuthentication, requireAdmin)

adminRouter.post("/zones", asyncHandler(createZoneController))
adminRouter.patch("/zones/:zoneId", asyncHandler(updateZoneController))
adminRouter.post(
  "/zones/:zoneId/overrides",
  asyncHandler(overrideController)
)
adminRouter.post(
  "/zones/:zoneId/credentials",
  asyncHandler(rotateZoneKeyController)
)
adminRouter.patch("/sensors/:sensorId", asyncHandler(updateSensorController))

adminRouter.get("/system-health", asyncHandler(systemHealthController))
adminRouter.get("/audit-logs", asyncHandler(listAuditLogsController))

adminRouter.get("/users", asyncHandler(listUsersController))
adminRouter.patch("/users/:userId/role", asyncHandler(updateUserRoleController))
