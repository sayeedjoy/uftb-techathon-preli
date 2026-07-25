import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import type { ZoneState } from "@scsrg/shared"

import { zoneFixture } from "@/test/fixtures"
import { StateBadge } from "./state-badge"
import { ZoneCard } from "./zone-card"

function renderCard(zone = zoneFixture()) {
  return render(
    <MemoryRouter>
      <ZoneCard zone={zone} />
    </MemoryRouter>
  )
}

describe("flow 1 · zone status rendering", () => {
  it.each<[ZoneState, string]>([
    ["SAFE", "Safe"],
    ["WARNING", "Warning"],
    ["CRITICAL", "Critical"],
    ["OFFLINE", "Offline"],
  ])("renders the %s state with an icon and a text label", (state, label) => {
    const { container } = render(<StateBadge state={state} />)

    // The text label must be present — colour alone is never the signal.
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("shows the zone name, code, risk score and a reason", () => {
    renderCard(
      zoneFixture({ currentRiskScore: 42.5, reasons: ["Gas is elevated"] })
    )

    expect(screen.getByText("IoT Lab")).toBeInTheDocument()
    expect(screen.getByText(/iot-lab/)).toBeInTheDocument()
    expect(screen.getByText("42.5")).toBeInTheDocument()
    expect(screen.getByText("Gas is elevated")).toBeInTheDocument()
  })

  it("renders the simulated LED, buzzer and relay", () => {
    renderCard(
      zoneFixture({
        state: "CRITICAL",
        actuators: {
          led: "RED",
          buzzerActive: true,
          relayCutoffActive: true,
          updatedAt: new Date().toISOString(),
        },
      })
    )

    expect(screen.getByText("Buzzer on")).toBeInTheDocument()
    expect(screen.getByText("Relay cut")).toBeInTheDocument()
  })
})

describe("flow 7 · offline status is never rendered as safe", () => {
  it("labels an offline zone Offline and shows when it was last seen", () => {
    renderCard(
      zoneFixture({
        state: "OFFLINE",
        lastSeenAt: new Date(Date.now() - 120_000).toISOString(),
      })
    )

    expect(screen.getByText("Offline")).toBeInTheDocument()
    expect(screen.queryByText("Safe")).not.toBeInTheDocument()
    expect(screen.getByText(/Last seen/)).toBeInTheDocument()
  })

  it("distinguishes OFFLINE from both SAFE and WARNING", () => {
    const { container: offline } = render(<StateBadge state="OFFLINE" />)
    const { container: warning } = render(<StateBadge state="WARNING" />)
    const { container: safe } = render(<StateBadge state="SAFE" />)

    const text = (element: HTMLElement) => element.textContent
    expect(text(offline)).not.toBe(text(warning))
    expect(text(offline)).not.toBe(text(safe))
  })

  it("renders an unavailable occupancy sensor as Unavailable, never Unoccupied", () => {
    renderCard(
      zoneFixture({
        sensors: [
          {
            type: "OCCUPANCY",
            name: "Occupancy sensor",
            status: "UNAVAILABLE",
            isCritical: false,
            lastSeenAt: null,
          },
        ],
        sensorValues: {
          fireDetected: null,
          fireSignal: 0,
          gasLevel: null,
          waterLevel: null,
          waterPhase: null,
          occupancyDetected: null,
        },
      })
    )

    expect(screen.getByText("Unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Unoccupied")).not.toBeInTheDocument()
  })

  it("does not claim a zone is unoccupied when occupancy is unknown", () => {
    renderCard(
      zoneFixture({
        sensorValues: {
          fireDetected: false,
          fireSignal: 0,
          gasLevel: 0.1,
          waterLevel: null,
          waterPhase: null,
          occupancyDetected: null,
        },
      })
    )

    expect(screen.queryByText("Unoccupied")).not.toBeInTheDocument()
  })
})
