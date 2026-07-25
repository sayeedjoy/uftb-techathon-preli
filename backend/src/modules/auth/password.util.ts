import bcrypt from "bcryptjs"

import { env } from "../../config/env.js"

/**
 * Password and API-key hashing.
 *
 * bcryptjs rather than native bcrypt: identical algorithm and cost semantics,
 * but no compiler toolchain needed for a clean clone on any platform.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_ROUNDS)
}

export function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

/** Zone API keys are hashed at rest with the same primitive. */
export const hashApiKey = hashPassword
export const verifyApiKey = verifyPassword

/**
 * Burns roughly the same time as a real comparison so an unknown email and a
 * wrong password are indistinguishable by response latency.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.cVfB6dJfvTPRvC4pBd8FbLpZmm7Sa1u"

export async function fakeVerifyPassword(plaintext: string): Promise<void> {
  await bcrypt.compare(plaintext, DUMMY_HASH)
}
