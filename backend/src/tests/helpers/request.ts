import type { Express } from "express"
import supertest from "supertest"
import type { UserRole } from "@scsrg/shared"

import { createApp } from "../../app.js"
import { prisma } from "../../database/prisma.js"
import { hashPassword } from "../../modules/auth/password.util.js"
import { signAccessToken } from "../../modules/auth/token.util.js"

let cachedApp: Express | null = null

export function app(): Express {
  cachedApp ??= createApp()
  return cachedApp
}

export function api() {
  return supertest(app())
}

export type TestUser = {
  id: string
  name: string
  email: string
  role: UserRole
  password: string
  token: string
}

let userCounter = 0

/** Creates a real user row and a matching signed token. */
export async function createUser(
  role: UserRole = "SECURITY_STAFF",
  overrides: { email?: string; name?: string; password?: string } = {}
): Promise<TestUser> {
  userCounter += 1
  const password = overrides.password ?? "Password123!"
  const email = overrides.email ?? `user-${userCounter}@scsrg.local`
  const name = overrides.name ?? `Test User ${userCounter}`

  const user = await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  })

  return {
    id: user.id,
    name,
    email,
    role,
    password,
    token: signAccessToken({ sub: user.id, email, name, role }),
  }
}

export async function createAdmin(): Promise<TestUser> {
  return createUser("ADMIN")
}

export function bearer(user: TestUser): string {
  return `Bearer ${user.token}`
}

/** Builds a well-formed reading payload with sane defaults. */
export function readingPayload(
  overrides: {
    readingId?: string
    sequenceNumber?: number
    capturedAt?: string
    sensors?: Record<string, unknown>
  } = {}
) {
  return {
    readingId: overrides.readingId ?? `reading-${Math.random().toString(36).slice(2)}`,
    sequenceNumber: overrides.sequenceNumber ?? 1,
    capturedAt: overrides.capturedAt ?? new Date().toISOString(),
    sensors: overrides.sensors ?? {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    },
  }
}
