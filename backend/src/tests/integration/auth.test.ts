import { describe, expect, it } from "vitest"

import { api, createAdmin, createUser } from "../helpers/request.js"

describe("POST /api/v1/auth/login", () => {
  it("issues a token for a valid security-staff login", async () => {
    const user = await createUser("SECURITY_STAFF")

    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.token).toBeTypeOf("string")
    expect(response.body.data.user.role).toBe("SECURITY_STAFF")
  })

  it("issues a token for a valid admin login", async () => {
    const admin = await createAdmin()

    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: admin.password })

    expect(response.status).toBe(200)
    expect(response.body.data.user.role).toBe("ADMIN")
  })

  it("never returns the password hash", async () => {
    const user = await createUser()

    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password })

    expect(JSON.stringify(response.body)).not.toContain("passwordHash")
    expect(JSON.stringify(response.body)).not.toContain("$2")
  })

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const user = await createUser()

    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "WrongPassword1!" })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS")
  })

  it("gives an unknown email the identical response — no user enumeration", async () => {
    const user = await createUser()

    const wrongPassword = await api()
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "WrongPassword1!" })
    const unknownEmail = await api()
      .post("/api/v1/auth/login")
      .send({ email: "nobody@scsrg.local", password: "WrongPassword1!" })

    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(unknownEmail.body.error.code).toBe(wrongPassword.body.error.code)
    expect(unknownEmail.body.error.message).toBe(
      wrongPassword.body.error.message
    )
  })

  it("rejects a malformed body with 400 and per-field details", async () => {
    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "short" })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
    expect(response.body.error.details.length).toBeGreaterThan(0)
  })

  it("is case-insensitive on the email", async () => {
    const user = await createUser("SECURITY_STAFF", {
      email: "casing@scsrg.local",
    })

    const response = await api()
      .post("/api/v1/auth/login")
      .send({ email: "CASING@SCSRG.LOCAL", password: user.password })

    expect(response.status).toBe(200)
  })
})

describe("GET /api/v1/auth/me", () => {
  it("returns the authenticated user", async () => {
    const user = await createUser()

    const response = await api()
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.user.email).toBe(user.email)
  })

  it("rejects a request with no token", async () => {
    const response = await api().get("/api/v1/auth/me")

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("UNAUTHENTICATED")
  })

  it("rejects a malformed token", async () => {
    const response = await api()
      .get("/api/v1/auth/me")
      .set("authorization", "Bearer not-a-real-token")

    expect(response.status).toBe(401)
  })

  it("rejects a token signed with a different secret", async () => {
    // Header/payload lifted from a valid token, signature replaced.
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IkFETUlOIn0.bogus"

    const response = await api()
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${forged}`)

    expect(response.status).toBe(401)
  })
})

describe("RBAC enforcement", () => {
  it("refuses a security-staff token on an admin route", async () => {
    const staff = await createUser("SECURITY_STAFF")

    const response = await api()
      .get("/api/v1/admin/system-health")
      .set("authorization", `Bearer ${staff.token}`)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe("FORBIDDEN")
  })

  it("allows an admin token on the same route", async () => {
    const admin = await createAdmin()

    const response = await api()
      .get("/api/v1/admin/system-health")
      .set("authorization", `Bearer ${admin.token}`)

    expect(response.status).toBe(200)
  })

  it("refuses an unauthenticated request to an admin route", async () => {
    const response = await api().get("/api/v1/admin/audit-logs")
    expect(response.status).toBe(401)
  })
})
