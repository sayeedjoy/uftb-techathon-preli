import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { ok } from "../../shared/response.js"
import { getDashboardSummary } from "./dashboard.service.js"

export const dashboardRouter: Router = Router()

dashboardRouter.use(requireAuthentication)

dashboardRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    ok(res, await getDashboardSummary())
  })
)
