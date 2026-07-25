import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { priorityEntryFixture } from "@/test/fixtures"
import { PriorityQueuePanel } from "./priority-queue"

const HIGHER = priorityEntryFixture({
  rank: 1,
  incidentId: "incident-high",
  zoneName: "Server Room",
  riskScore: 92,
  priorityScore: 121,
  breakdown: {
    risk: 92,
    occupancy: 10,
    duration: 6,
    asset: 8,
    multiHazard: 5,
    acknowledged: 0,
    humanReport: 0,
  },
  reasons: [
    "Live risk score 92",
    "Zone is occupied (+10)",
    "High-value zone, asset importance 8 (+8)",
  ],
})

const LOWER = priorityEntryFixture({
  rank: 2,
  incidentId: "incident-low",
  zoneName: "IoT Lab",
  riskScore: 84,
  priorityScore: 112,
})

describe("flow 2 · priority ordering matches the API rank", () => {
  it("renders rows in the API's order and never re-sorts them", () => {
    render(
      <PriorityQueuePanel queue={[HIGHER, LOWER]} isLoading={false} error={null} />
    )

    const rows = screen.getAllByTestId(/^rank-row-/)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText("Server Room")).toBeInTheDocument()
    expect(within(rows[1]!).getByText("IoT Lab")).toBeInTheDocument()
  })

  it("preserves the server order even when scores would sort differently", () => {
    // The API says the *lower* score ranks first; the client must obey.
    const inverted = [
      { ...LOWER, rank: 1 },
      { ...HIGHER, rank: 2 },
    ]
    render(
      <PriorityQueuePanel queue={inverted} isLoading={false} error={null} />
    )

    const rows = screen.getAllByTestId(/^rank-row-/)
    expect(within(rows[0]!).getByText("IoT Lab")).toBeInTheDocument()
  })
})

describe("flow 3 · the ranking explanation is visible", () => {
  it("shows why rank 1 outranks rank 2 without opening a detail view", () => {
    render(
      <PriorityQueuePanel queue={[HIGHER, LOWER]} isLoading={false} error={null} />
    )

    const first = screen.getByTestId("rank-row-1")

    expect(within(first).getByText(/Live risk score 92/)).toBeInTheDocument()
    expect(
      within(first).getByText(/High-value zone, asset importance 8/)
    ).toBeInTheDocument()

    // The score breakdown is rendered as labelled chips.
    expect(within(first).getByText(/asset \+8/)).toBeInTheDocument()
    expect(within(first).getByText(/multi-hazard \+5/)).toBeInTheDocument()
  })

  it("shows the risk, priority, occupancy, duration and hazard for each row", () => {
    render(<PriorityQueuePanel queue={[HIGHER]} isLoading={false} error={null} />)

    const row = screen.getByTestId("rank-row-1")
    expect(within(row).getAllByText(/risk 92/).length).toBeGreaterThan(0)
    expect(within(row).getByText("121.0")).toBeInTheDocument()
    expect(within(row).getByText("Occupied")).toBeInTheDocument()
    expect(within(row).getByText(/critical for/)).toBeInTheDocument()
    expect(within(row).getByText(/main hazard: fire/)).toBeInTheDocument()
  })

  it("flags unknown occupancy rather than calling the zone empty", () => {
    render(
      <PriorityQueuePanel
        queue={[priorityEntryFixture({ occupancy: "UNKNOWN" })]}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText("Occupancy unknown")).toBeInTheDocument()
    expect(screen.queryByText("Empty")).not.toBeInTheDocument()
  })
})

describe("flow 4 · acknowledgment interaction", () => {
  it("fires the acknowledge callback for the right incident", async () => {
    const onAcknowledge = vi.fn()
    render(
      <PriorityQueuePanel
        queue={[HIGHER]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }))

    expect(onAcknowledge).toHaveBeenCalledWith("incident-high")
  })

  it("hides the acknowledge action once an incident is acknowledged", () => {
    render(
      <PriorityQueuePanel
        queue={[
          priorityEntryFixture({
            acknowledged: true,
            acknowledgedByName: "Noel Ferreira",
          }),
        ]}
        isLoading={false}
        error={null}
        onAcknowledge={vi.fn()}
      />
    )

    expect(
      screen.queryByRole("button", { name: "Acknowledge" })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/acknowledged by Noel Ferreira/)).toBeInTheDocument()
  })

  it("states plainly when nothing is critical", () => {
    render(<PriorityQueuePanel queue={[]} isLoading={false} error={null} />)

    expect(screen.getByText("No active critical incidents.")).toBeInTheDocument()
  })
})
