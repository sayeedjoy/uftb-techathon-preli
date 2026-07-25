import type { User } from "@prisma/client"
import type { AuthUserDto, LoginInput, LoginResponseDto } from "@scsrg/shared"

import { env } from "../../config/env.js"
import { InvalidCredentialsError, UnauthenticatedError } from "../../shared/errors.js"
import { findUserByEmail, findUserById } from "./auth.repository.js"
import { fakeVerifyPassword, verifyPassword } from "./password.util.js"
import { signAccessToken } from "./token.util.js"

/** The only shape a user ever takes on the wire. `passwordHash` cannot leak. */
export function toAuthUser(user: User): AuthUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

/**
 * Authenticates a set of credentials.
 *
 * An unknown email and a wrong password produce the identical error *and* burn
 * comparable time — a bcrypt comparison runs against a dummy hash when no user
 * exists — so the endpoint cannot be used to enumerate accounts.
 */
export async function login(input: LoginInput): Promise<LoginResponseDto> {
  const user = await findUserByEmail(input.email)

  if (!user) {
    await fakeVerifyPassword(input.password)
    throw new InvalidCredentialsError()
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash)
  if (!passwordMatches) {
    throw new InvalidCredentialsError()
  }

  if (!user.isActive) {
    throw new InvalidCredentialsError("This account has been deactivated.")
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: toAuthUser(user),
  }
}

/** Re-reads the user from the database so a revoked role takes effect at once. */
export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await findUserById(userId)
  if (!user || !user.isActive) {
    throw new UnauthenticatedError("Your session is no longer valid.")
  }
  return toAuthUser(user)
}
