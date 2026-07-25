import { describe, expect, it, vi } from "vitest"
import { http, HttpResponse } from "msw"

import { server } from "@/test/msw/server"
import { ApiError, apiGet, setUnauthorizedHandler } from "./api"

describe("the API client", () => {
  it("unwraps a success envelope", async () => {
    server.use(
      http.get("/api/v1/thing", () =>
        HttpResponse.json({ success: true, data: { value: 42 } })
      )
    )

    await expect(apiGet<{ value: number }>("/thing")).resolves.toEqual({
      value: 42,
    })
  })

  it("throws a typed ApiError carrying the machine-readable code", async () => {
    server.use(
      http.get("/api/v1/thing", () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: "VALUE_OUT_OF_RANGE",
              message: "Gas level must be between 0 and 1.",
              details: [{ path: "sensors.gasLevel", message: "out of range" }],
            },
          },
          { status: 422 }
        )
      )
    )

    const error = await apiGet("/thing").catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("VALUE_OUT_OF_RANGE")
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).details).toHaveLength(1)
  })

  it("flags a 409 as a conflict so callers can treat it as an outcome", async () => {
    server.use(
      http.get("/api/v1/thing", () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "ALREADY_ACKNOWLEDGED", message: "Already done." },
          },
          { status: 409 }
        )
      )
    )

    const error = (await apiGet("/thing").catch((caught) => caught)) as ApiError
    expect(error.isConflict).toBe(true)
  })

  it("clears the session exactly once for a burst of 401s", async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    window.localStorage.setItem("scsrg.token", "stale-token")

    server.use(
      http.get("/api/v1/thing", () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "UNAUTHENTICATED", message: "Session expired." },
          },
          { status: 401 }
        )
      )
    )

    await Promise.all([
      apiGet("/thing").catch(() => null),
      apiGet("/thing").catch(() => null),
      apiGet("/thing").catch(() => null),
    ])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem("scsrg.token")).toBeNull()
  })

  it("reports an unreachable server rather than throwing a raw fetch error", async () => {
    server.use(http.get("/api/v1/thing", () => HttpResponse.error()))

    const error = (await apiGet("/thing").catch((caught) => caught)) as ApiError
    expect(error.code).toBe("NETWORK_ERROR")
  })
})
