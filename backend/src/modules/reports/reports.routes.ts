import { Router } from "express"
import { confirmReportSchema, naturalLanguageReportSchema } from "@scsrg/shared"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { requireAdmin } from "../../middleware/authorization.middleware.js"
import { clientIp } from "../../middleware/request-context.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { UnauthenticatedError } from "../../shared/errors.js"
import { created, ok } from "../../shared/response.js"
import {
  confirmReport,
  listReports,
  rejectReport,
  submitNaturalLanguageReport,
} from "./reports.service.js"
import { requiredPathParam } from "../../shared/params.js"

export const reportsRouter: Router = Router()

reportsRouter.use(requireAuthentication)

// Both roles may report what they saw — that is the point of the feature.
reportsRouter.post(
  "/natural-language",
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthenticatedError()
    const input = naturalLanguageReportSchema.parse(req.body)

    const report = await submitNaturalLanguageReport(
      input,
      { id: req.user.id, name: req.user.name },
      clientIp(req)
    )
    created(res, { report })
  })
)

reportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status
    ok(res, {
      reports: await listReports(
        status === "PENDING" || status === "CONFIRMED" || status === "REJECTED"
          ? status
          : undefined
      ),
    })
  })
)

// Confirmation is admin-only: it is the moment a report gains any influence.
reportsRouter.post(
  "/:reportId/confirm",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthenticatedError()
    const reportId = requiredPathParam(
      req,
      "reportId",
      "No report was specified."
    )

    const body = confirmReportSchema.parse(req.body ?? {})
    const report = await confirmReport(
      reportId,
      { id: req.user.id, name: req.user.name },
      body.note,
      clientIp(req)
    )
    ok(res, { report })
  })
)

reportsRouter.post(
  "/:reportId/reject",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthenticatedError()
    const reportId = requiredPathParam(
      req,
      "reportId",
      "No report was specified."
    )

    ok(res, {
      report: await rejectReport(reportId, { id: req.user.id }, clientIp(req)),
    })
  })
)
