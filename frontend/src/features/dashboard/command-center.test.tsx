import { describe, expect, it } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders, signIn } from "@/test/render"
import { socketDouble, withEnvelope } from "@/test/socket-double"
import { incidentFixture, zoneFixture } from "@/test/fixtures"
import { server } from "@/test/msw/server"
import { conflictAcknowledgeHandler } from "@/test/msw/handlers"
import { CommandCenterPage } from "./command-center-page"
import { SocketProvider } from "@/hooks/use-socket"

function renderCommandCenter() {
  signIn("SECURITY_STAFF")
  return renderWithProviders(
    <SocketProvider>
      <CommandCenterPage />
    </SocketProvider>
  )
}

describe("flow 5 · socket events update the rendered zone", () => {
  it("re-renders a zone card from a socket event, with no refetch loop", async () => {
    renderCommandCenter()

    await screen.findByTestId("zone-card-iot-lab")
    expect(within(screen.getByTestId("zone-card-iot-lab")).getByText("Safe"))
      .toBeInTheDocument()

    act(() => {
      socketDouble.server(
        "zone:updated",
        withEnvelope({
          zone: zoneFixture({
            state: "CRITICAL",
            currentRiskScore: 84,
            reasons: ["Sustained flame confirmed after debounce"],
          }),
        })
      )
    })

    await waitFor(() => {
      const card = screen.getByTestId("zone-card-iot-lab")
      expect(within(card).getByText("Critical")).toBeInTheDocument()
      expect(within(card).getByText("84.0")).toBeInTheDocument()
    })
  })

  it("ignores a repeated eventId so a replay cannot double-apply", async () => {
    renderCommandCenter()
    await screen.findByTestId("zone-card-iot-lab")

    const payload = withEnvelope(
      { zone: zoneFixture({ state: "WARNING", currentRiskScore: 40 }) },
      { eventId: "repeat-me" }
    )

    act(() => socketDouble.server("zone:updated", payload))
    await waitFor(() =>
      expect(
        within(screen.getByTestId("zone-card-iot-lab")).getByText("Warning")
      ).toBeInTheDocument()
    )

    // The same event again must be dropped entirely, not re-applied.
    act(() =>
      socketDouble.server(
        "zone:updated",
        withEnvelope(
          { zone: zoneFixture({ state: "SAFE", currentRiskScore: 1 }) },
          { eventId: "repeat-me" }
        )
      )
    )

    expect(
      within(screen.getByTestId("zone-card-iot-lab")).getByText("Warning")
    ).toBeInTheDocument()
  })

  it("refetches the snapshot queries on every connect", async () => {
    const { queryClient } = renderCommandCenter()
    await screen.findByTestId("zone-card-iot-lab")

    // The provider subscribes to `connect`; firing it stands in for a reconnect.
    act(() => socketDouble.server("connect" as never, undefined as never))

    await waitFor(() => {
      expect(queryClient.getQueryState(["zones", "list"])).toBeDefined()
      expect(queryClient.getQueryState(["dashboard", "summary"])).toBeDefined()
      expect(queryClient.getQueryState(["priority-queue"])).toBeDefined()
    })
  })
})

describe("flow 6 · multiple stacked alerts stay independently visible", () => {
  it("raises one toast per critical incident", async () => {
    renderCommandCenter()
    await screen.findByTestId("zone-card-iot-lab")

    act(() => {
      socketDouble.server(
        "incident:created",
        withEnvelope({ incident: incidentFixture() })
      )
      socketDouble.server(
        "incident:created",
        withEnvelope({
          incident: incidentFixture({
            id: "incident-2",
            zoneId: "zone-2",
            zoneCode: "server-room",
            zoneName: "Server Room",
          }),
        })
      )
    })

    // Both alerts must survive — neither overwrites the other.
    expect(await screen.findByText(/CRITICAL · IoT Lab/)).toBeInTheDocument()
    expect(await screen.findByText(/CRITICAL · Server Room/)).toBeInTheDocument()
  })

  it("raises no toast for an event that predates the connection", async () => {
    renderCommandCenter()
    await screen.findByTestId("zone-card-iot-lab")

    act(() => {
      socketDouble.server(
        "incident:created",
        withEnvelope(
          {
            incident: incidentFixture({
              id: "backdated-incident",
              zoneName: "Robotics Lab",
            }),
          },
          { emittedAt: new Date(Date.now() - 60_000).toISOString() }
        )
      )
    })

    await waitFor(() =>
      expect(screen.queryByText(/CRITICAL · Robotics Lab/)).not.toBeInTheDocument()
    )
  })
})

describe("flow 8 · the critical banner and acknowledgment", () => {
  it("shows the banner with the leading hazard for the top unacknowledged incident", async () => {
    renderCommandCenter()

    const banner = await screen.findByTestId("critical-banner")
    expect(within(banner).getByText(/CRITICAL · IoT Lab/)).toBeInTheDocument()
    expect(within(banner).getByText(/leading hazard fire/)).toBeInTheDocument()
  })

  it("acknowledges from the banner and reports success", async () => {
    renderCommandCenter()

    const banner = await screen.findByTestId("critical-banner")
    await userEvent.click(
      within(banner).getByRole("button", { name: "Acknowledge" })
    )

    expect(await screen.findByText("Incident acknowledged")).toBeInTheDocument()
  })

  it("renders a 409 as 'already acknowledged', not as a failure", async () => {
    server.use(conflictAcknowledgeHandler)
    renderCommandCenter()

    const banner = await screen.findByTestId("critical-banner")
    await userEvent.click(
      within(banner).getByRole("button", { name: "Acknowledge" })
    )

    expect(await screen.findByText("Already acknowledged")).toBeInTheDocument()
    expect(screen.queryByText("Could not acknowledge")).not.toBeInTheDocument()
  })
})

describe("summary bar", () => {
  it("shows the operating picture including offline zones", async () => {
    renderCommandCenter()

    const bar = await screen.findByTestId("summary-bar")
    expect(within(bar).getByText("Unacknowledged")).toBeInTheDocument()
    expect(within(bar).getByText("Offline")).toBeInTheDocument()
    expect(within(bar).getByText("3/3")).toBeInTheDocument()
  })
})
