import { describe, expect, it } from "vitest"

import {
  ACTIVE_INCIDENT_STATUSES,
  ERROR_CODE,
  INCIDENT_STATUSES,
  SERVER_EVENT_NAMES,
  SOCKET_ROOM,
  USER_ROLES,
  ZONE_STATES,
  isApiSuccess,
  loginSchema,
  paginationSchema,
  sensorReadingSchema,
  overrideSchema,
  naturalLanguageReportSchema,
} from "./index.js"

/**
 * The wire contract's own tests.
 *
 * These lock the invariants both apps depend on. If one of these breaks, the
 * failure would otherwise show up as a confusing runtime mismatch in whichever
 * package noticed first.
 */
describe("domain enums", () => {
  it("exposes exactly the four zone states", () => {
    expect([...ZONE_STATES]).toEqual(["SAFE", "WARNING", "CRITICAL", "OFFLINE"])
  })

  it("treats OPEN and ACKNOWLEDGED as the active incident statuses", () => {
    // This set is mirrored by the partial unique index in Postgres; the two
    // must agree or the no-duplicate-incident guarantee silently weakens.
    expect([...ACTIVE_INCIDENT_STATUSES]).toEqual(["OPEN", "ACKNOWLEDGED"])
    expect(INCIDENT_STATUSES).toContain("RESOLVED")
  })

  it("exposes exactly two roles", () => {
    expect([...USER_ROLES]).toEqual(["SECURITY_STAFF", "ADMIN"])
  })
})

describe("API envelope", () => {
  it("narrows a success response", () => {
    const response = { success: true, data: { value: 1 } } as const
    expect(isApiSuccess(response)).toBe(true)
  })

  it("narrows an error response", () => {
    const response = {
      success: false,
      error: { code: ERROR_CODE.NOT_FOUND, message: "gone" },
    } as const
    expect(isApiSuccess(response)).toBe(false)
  })
})

describe("sensorReadingSchema", () => {
  const valid = {
    readingId: "iot-lab-1042",
    sequenceNumber: 1042,
    capturedAt: "2026-07-25T10:30:15.000Z",
    sensors: { fireDetected: true, gasLevel: 0.72, occupancyDetected: true },
  }

  it("accepts a well-formed raw reading", () => {
    expect(sensorReadingSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ["riskScore", { riskScore: 90 }],
    ["state", { state: "CRITICAL" }],
    ["priority", { priority: 1 }],
    ["incidentStatus", { incidentStatus: "OPEN" }],
  ])("rejects a node-supplied %s", (_label, extra) => {
    expect(sensorReadingSchema.safeParse({ ...valid, ...extra }).success).toBe(
      false
    )
  })

  it("rejects an unknown key inside sensors", () => {
    expect(
      sensorReadingSchema.safeParse({
        ...valid,
        sensors: { ...valid.sensors, calculatedState: "CRITICAL" },
      }).success
    ).toBe(false)
  })

  it("accepts a null occupancy reading, meaning unavailable", () => {
    const parsed = sensorReadingSchema.safeParse({
      ...valid,
      sensors: { occupancyDetected: null },
    })
    expect(parsed.success).toBe(true)
  })

  it("requires a reading id and a sequence number", () => {
    expect(
      sensorReadingSchema.safeParse({ ...valid, readingId: "" }).success
    ).toBe(false)
    expect(
      sensorReadingSchema.safeParse({ ...valid, sequenceNumber: -1 }).success
    ).toBe(false)
  })
})

describe("loginSchema", () => {
  it("lowercases the email so sign-in is case-insensitive", () => {
    const parsed = loginSchema.parse({
      email: "ADMIN@SCSRG.LOCAL",
      password: "Admin123!",
    })
    expect(parsed.email).toBe("admin@scsrg.local")
  })

  it("rejects a short password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "short" }).success
    ).toBe(false)
  })
})

describe("overrideSchema", () => {
  it("requires a reason of at least five characters", () => {
    expect(
      overrideSchema.safeParse({ action: "SILENCE_BUZZER", reason: "x" })
        .success
    ).toBe(false)
    expect(
      overrideSchema.safeParse({
        action: "SILENCE_BUZZER",
        reason: "Confirmed drill",
      }).success
    ).toBe(true)
  })
})

describe("paginationSchema", () => {
  it("coerces query strings and applies defaults", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 })
    expect(paginationSchema.parse({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
    })
  })

  it("caps the page size", () => {
    expect(paginationSchema.safeParse({ pageSize: "100000" }).success).toBe(
      false
    )
  })
})

describe("naturalLanguageReportSchema", () => {
  it("requires enough text to be worth extracting from", () => {
    expect(naturalLanguageReportSchema.safeParse({ text: "gas" }).success).toBe(
      false
    )
    expect(
      naturalLanguageReportSchema.safeParse({
        text: "Smell of gas near the IoT Lab bench, not sure how bad.",
      }).success
    ).toBe(true)
  })
})

describe("realtime contract", () => {
  it("names every server event exactly once", () => {
    expect(new Set(SERVER_EVENT_NAMES).size).toBe(SERVER_EVENT_NAMES.length)
  })

  it("scopes zone rooms by id", () => {
    expect(SOCKET_ROOM.zone("abc")).toBe("zone:abc")
    expect(SOCKET_ROOM.dashboard).toBe("dashboard")
    expect(SOCKET_ROOM.admin).toBe("admin")
  })
})
