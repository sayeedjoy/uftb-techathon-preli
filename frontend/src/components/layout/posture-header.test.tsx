import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { DashboardSummaryDto } from "@scsrg/shared"

import { summaryFixture } from "@/test/fixtures"
import { PostureHeader } from "./posture-header"

function renderPosture(overrides: Partial<DashboardSummaryDto> = {}) {
  return render(
    <PostureHeader summary={summaryFixture(overrides)} isLoading={false} />
  )
}

describe("system posture", () => {
  it("reads All clear only when nothing is wrong", () => {
    renderPosture({
      stateCounts: { SAFE: 3, WARNING: 0, CRITICAL: 0, OFFLINE: 0 },
      offlineZones: 0,
      unacknowledgedIncidents: 0,
      activeIncidents: 0,
    })

    expect(screen.getByText("All clear")).toBeInTheDocument()
    expect(screen.getByTestId("posture-header")).toHaveAttribute(
      "data-posture",
      "SAFE"
    )
  })

  it("lets critical outrank warning and offline", () => {
    renderPosture({
      stateCounts: { SAFE: 0, WARNING: 1, CRITICAL: 2, OFFLINE: 1 },
      offlineZones: 1,
      unacknowledgedIncidents: 2,
    })

    expect(screen.getByTestId("posture-header")).toHaveAttribute(
      "data-posture",
      "CRITICAL"
    )
    expect(screen.getByText("2 incidents need response")).toBeInTheDocument()
  })

  it("does not report a silent zone as safe", () => {
    renderPosture({
      stateCounts: { SAFE: 2, WARNING: 0, CRITICAL: 0, OFFLINE: 1 },
      offlineZones: 1,
      unacknowledgedIncidents: 0,
    })

    const header = screen.getByTestId("posture-header")
    expect(header).toHaveAttribute("data-posture", "OFFLINE")
    expect(screen.getByText("1 zone not reporting")).toBeInTheDocument()
    expect(screen.queryByText("All clear")).not.toBeInTheDocument()
  })

  it("labels every state in the distribution, so it never relies on colour", () => {
    renderPosture({
      stateCounts: { SAFE: 1, WARNING: 1, CRITICAL: 1, OFFLINE: 0 },
      offlineZones: 0,
    })

    const header = screen.getByTestId("posture-header")
    for (const label of ["Safe", "Warning", "Critical", "Offline"]) {
      expect(within(header).getByText(label)).toBeInTheDocument()
    }
  })

  it("surfaces the backend health rollup", () => {
    renderPosture({
      health: {
        backendStatus: "OK",
        databaseConnected: true,
        socketConnections: 4,
        offlineZoneCount: 0,
        failedActuationCount: 0,
        recentValidationFailureCount: 0,
      },
    })

    const header = screen.getByTestId("posture-header")
    expect(within(header).getByText("Backend")).toBeInTheDocument()
    expect(within(header).getByText("connected")).toBeInTheDocument()
    expect(within(header).getByText("4")).toBeInTheDocument()
  })

  it("shows a skeleton rather than an empty frame while loading", () => {
    render(<PostureHeader summary={undefined} isLoading />)

    expect(screen.getByLabelText("Loading system posture")).toBeInTheDocument()
    expect(screen.queryByTestId("posture-header")).not.toBeInTheDocument()
  })
})
