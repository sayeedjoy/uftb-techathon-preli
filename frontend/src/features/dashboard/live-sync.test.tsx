import { describe, expect, it } from "vitest"
import { act } from "@testing-library/react"
import type { ZoneDetailDto } from "@scsrg/shared"

import { renderWithProviders, signIn } from "@/test/render"
import { socketDouble, withEnvelope } from "@/test/socket-double"
import { zoneFixture } from "@/test/fixtures"
import { queryKeys } from "@/lib/query-keys"
import { SocketProvider } from "@/hooks/use-socket"
import { useLiveDashboardSync } from "./use-dashboard-data"

function detailFixture(): ZoneDetailDto {
  return {
    ...zoneFixture(),
    configuration: {
      sensors: [
        {
          id: "sensor-1",
          type: "FLAME",
          name: "Flame detector",
          status: "ONLINE",
          isCritical: true,
          lastSeenAt: null,
        },
      ],
      offlineTimeoutMs: 10_000,
      gasWarmupMs: 5_000,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ZoneDetailDto
}

function Harness() {
  useLiveDashboardSync()
  return null
}

function renderSync() {
  signIn("ADMIN")
  const { queryClient } = renderWithProviders(
    <SocketProvider>
      <Harness />
    </SocketProvider>
  )
  return queryClient
}

describe("live cache sync", () => {
  it("keeps detail-only fields when a summary arrives over the socket", () => {
    const queryClient = renderSync()
    const detail = detailFixture()
    queryClient.setQueryData(queryKeys.zones.detail(detail.id), {
      zone: detail,
    })

    act(() => {
      socketDouble.server(
        "zone:updated",
        withEnvelope({
          zone: zoneFixture({ state: "CRITICAL", currentRiskScore: 88 }),
        })
      )
    })

    const cached = queryClient.getQueryData<{ zone: ZoneDetailDto }>(
      queryKeys.zones.detail(detail.id)
    )

    // The live values are applied...
    expect(cached?.zone.state).toBe("CRITICAL")
    expect(cached?.zone.currentRiskScore).toBe(88)

    // ...and `configuration` survives. Replacing rather than merging dropped
    // it, and the zone detail page then threw on
    // `detail.configuration.sensors`.
    expect(cached?.zone.configuration).toBeDefined()
    expect(cached?.zone.configuration.sensors).toHaveLength(1)
    expect(cached?.zone.createdAt).toBe(detail.createdAt)
  })

  it("does not fabricate a detail entry from a summary alone", () => {
    const queryClient = renderSync()

    act(() => {
      socketDouble.server(
        "zone:updated",
        withEnvelope({ zone: zoneFixture({ state: "WARNING" }) })
      )
    })

    // Nothing was cached for the detail route, so nothing should be invented:
    // a half-populated detail entry would crash the page it feeds.
    expect(
      queryClient.getQueryData(queryKeys.zones.detail("zone-1"))
    ).toBeUndefined()
  })

  it("still patches the zone list", () => {
    const queryClient = renderSync()
    queryClient.setQueryData(queryKeys.zones.list(), {
      zones: [zoneFixture()],
    })

    act(() => {
      socketDouble.server(
        "zone:updated",
        withEnvelope({ zone: zoneFixture({ state: "CRITICAL" }) })
      )
    })

    const cached = queryClient.getQueryData<{
      zones: Array<{ state: string }>
    }>(queryKeys.zones.list())
    expect(cached?.zones[0]?.state).toBe("CRITICAL")
  })
})
