import type { NextFunction, Request, Response } from "express"

import { UnauthenticatedError } from "../shared/errors.js"
import {
  extractBearerToken,
  verifyAccessToken,
} from "../modules/auth/token.util.js"

/**
 * Attaches a typed `req.user` from the Bearer token, or refuses the request.
 *
 * A zone API key can never satisfy this middleware, and a JWT can never satisfy
 * the zone-key middleware — the two credential types are non-interchangeable.
 */
export function requireAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers.authorization)

  if (!token) {
    next(new UnauthenticatedError("A bearer token is required."))
    return
  }

  try {
    const claims = verifyAccessToken(token)
    req.user = {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      role: claims.role,
    }
    next()
  } catch (error) {
    next(error)
  }
}

/** Populates `req.user` when a token is present but never rejects. */
export function optionalAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req.headers.authorization)
  if (!token) {
    next()
    return
  }
  try {
    const claims = verifyAccessToken(token)
    req.user = {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      role: claims.role,
    }
  } catch {
    // An invalid token on an optional route is simply "not authenticated".
  }
  next()
}
