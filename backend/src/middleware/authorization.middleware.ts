import type { NextFunction, Request, RequestHandler, Response } from "express"
import { USER_ROLE, type UserRole } from "@scsrg/shared"

import { ForbiddenError, UnauthenticatedError } from "../shared/errors.js"

/**
 * Backend-enforced RBAC.
 *
 * The frontend hiding a button is a courtesy; this is the mechanism. Every
 * admin route carries `requireRole("ADMIN")` and an integration test asserts a
 * `SECURITY_STAFF` token gets 403 on each one.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthenticatedError())
      return
    }

    if (!roles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `This action requires the ${roles.join(" or ")} role.`
        )
      )
      return
    }

    next()
  }
}

export const requireAdmin: RequestHandler = requireRole(USER_ROLE.ADMIN)

/**
 * The route-guard matrix, in one place, mirroring spec §9.13.
 * Documentation *and* the source the OpenAPI security notes are generated from.
 */
export const ROUTE_GUARD_MATRIX = {
  "POST /auth/login": "public",
  "GET /auth/me": "authenticated",
  "GET /zones": "authenticated",
  "GET /zones/:zoneId": "authenticated",
  "GET /zones/:zoneId/readings": "ADMIN",
  "GET /zones/:zoneId/timeline": "authenticated",
  "GET /zones/:zoneId/system-health": "ADMIN",
  "POST /ingestion/*": "zone-api-key",
  "GET /incidents": "authenticated",
  "GET /incidents/:incidentId": "authenticated",
  "GET /incidents/:incidentId/timeline": "authenticated",
  "POST /incidents/:incidentId/acknowledge": "authenticated",
  "GET /priority-queue": "authenticated",
  "GET /dashboard/summary": "authenticated",
  "POST /reports/natural-language": "authenticated",
  "POST /reports/:reportId/confirm": "ADMIN",
  "GET /admin/*": "ADMIN",
  "POST /admin/*": "ADMIN",
  "PATCH /admin/*": "ADMIN",
  "GET /simulator/*": "ADMIN",
  "POST /simulator/*": "ADMIN",
  "PATCH /simulator/*": "ADMIN",
} as const satisfies Record<string, "public" | "authenticated" | "zone-api-key" | UserRole>
