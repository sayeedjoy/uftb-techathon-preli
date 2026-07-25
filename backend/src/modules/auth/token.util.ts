import jwt from "jsonwebtoken"
import { USER_ROLES, type UserRole } from "@scsrg/shared"

import { env } from "../../config/env.js"
import { UnauthenticatedError } from "../../shared/errors.js"

export type AccessTokenClaims = {
  sub: string
  email: string
  name: string
  role: UserRole
}

/** Signs a short-lived access token. There is no refresh token by design (D6). */
export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(
    { email: claims.email, name: claims.name, role: claims.role },
    env.JWT_SECRET,
    {
      subject: claims.sub,
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      issuer: "scsrg",
    }
  )
}

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
  )
}

/**
 * Verifies a token and narrows the payload.
 *
 * Any failure — malformed, expired, wrong secret, missing claim — raises the
 * same `UNAUTHENTICATED` error, so a caller cannot probe why it was rejected.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { issuer: "scsrg" })
  } catch {
    throw new UnauthenticatedError("Your session is invalid or has expired.")
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new UnauthenticatedError("Your session is invalid or has expired.")
  }

  const payload = decoded as Record<string, unknown>
  const { sub, email, name, role } = payload

  if (
    typeof sub !== "string" ||
    typeof email !== "string" ||
    typeof name !== "string" ||
    !isUserRole(role)
  ) {
    throw new UnauthenticatedError("Your session is invalid or has expired.")
  }

  return { sub, email, name, role }
}

/** Extracts the bearer token from an Authorization header, if present. */
export function extractBearerToken(
  header: string | undefined
): string | null {
  if (!header) return null
  const [scheme, value] = header.split(" ")
  if (!value || scheme?.toLowerCase() !== "bearer") return null
  return value.trim() || null
}
