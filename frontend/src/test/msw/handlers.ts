import { http, HttpResponse } from "msw"
import type { AuthUserDto } from "@scsrg/shared"

import {
  incidentFixture,
  priorityEntryFixture,
  summaryFixture,
  zoneFixture,
} from "../fixtures.ts"

const BASE = "/api/v1"

export const STAFF_USER: AuthUserDto = {
  id: "user-staff",
  name: "Security Mama",
  email: "security@scsrg.local",
  role: "SECURITY_STAFF",
  createdAt: new Date().toISOString(),
}

export const ADMIN_USER: AuthUserDto = {
  id: "user-admin",
  name: "Sayeed Joy",
  email: "admin@scsrg.local",
  role: "ADMIN",
  createdAt: new Date().toISOString(),
}

/** Mutable so a test can decide which role `/auth/me` reports. */
export const authState = { user: STAFF_USER as AuthUserDto }

function ok<T>(data: T, meta?: Record<string, unknown>) {
  return HttpResponse.json({ success: true, data, ...(meta ? { meta } : {}) })
}

export const handlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }

    if (body.password !== "Password123!") {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
        },
        { status: 401 }
      )
    }

    const user = body.email === ADMIN_USER.email ? ADMIN_USER : STAFF_USER
    authState.user = user

    return ok({ token: "test-token", expiresIn: "60m", user })
  }),

  http.get(`${BASE}/auth/me`, () => ok({ user: authState.user })),

  http.get(`${BASE}/zones`, () =>
    ok({
      zones: [
        zoneFixture(),
        zoneFixture({
          id: "zone-2",
          code: "server-room",
          name: "Server Room",
          state: "OFFLINE",
          currentRiskScore: 0,
          lastSeenAt: new Date(Date.now() - 120_000).toISOString(),
          reasons: [
            "No reading or heartbeat since 12:00 — zone is offline, not safe",
          ],
          sensorValues: {
            fireDetected: null,
            fireSignal: 0,
            gasLevel: null,
            waterLevel: null,
            waterPhase: null,
            occupancyDetected: null,
          },
        }),
      ],
    })
  ),

  http.get(`${BASE}/dashboard/summary`, () => ok(summaryFixture())),

  http.get(`${BASE}/priority-queue`, () =>
    ok({ queue: [priorityEntryFixture()] })
  ),

  http.get(`${BASE}/incidents`, () =>
    ok(
      { incidents: [incidentFixture()] },
      {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      }
    )
  ),

  http.post(`${BASE}/incidents/:incidentId/acknowledge`, () =>
    ok({
      acknowledgment: {
        id: "ack-1",
        incidentId: "incident-1",
        userId: authState.user.id,
        userName: authState.user.name,
        acknowledgedAt: new Date().toISOString(),
        note: null,
      },
    })
  ),
]

/** Used by the "already acknowledged" test. */
export const conflictAcknowledgeHandler = http.post(
  `${BASE}/incidents/:incidentId/acknowledge`,
  () =>
    HttpResponse.json(
      {
        success: false,
        error: {
          code: "ALREADY_ACKNOWLEDGED",
          message: "This incident has already been acknowledged.",
        },
      },
      { status: 409 }
    )
)
