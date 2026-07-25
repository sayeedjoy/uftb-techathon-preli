import { describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { IncidentReportDto } from "@scsrg/shared"

import { renderWithProviders, signIn } from "@/test/render"
import { server } from "@/test/msw/server"
import { ReportsPage } from "./reports-page"

/**
 * The review queue.
 *
 * Approval is the only moment a report gains any influence, so who may cast a
 * verdict — and that a verdict is never cast by accident — is the property
 * worth pinning down here.
 */

function reportFixture(
  overrides: Partial<IncidentReportDto> = {}
): IncidentReportDto {
  return {
    id: "report-pending",
    userId: "user-staff",
    userName: "Security Mama",
    rawText: "smell of gas near the IoT Lab bench",
    zoneId: "zone-1",
    zoneCode: "IOT-LAB",
    hazardType: "GAS",
    estimatedSeverity: 3,
    confidence: 0.92,
    confirmationMessage:
      "Recorded a gas hazard in the IoT Lab at estimated severity 3/5.",
    status: "PENDING",
    extractorProvider: "deterministic",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    ...overrides,
  }
}

const APPROVED = reportFixture({
  id: "report-approved",
  rawText: "water pooling under the server rack",
  hazardType: "WATER",
  status: "CONFIRMED",
  confirmedAt: new Date().toISOString(),
})

function stubList(reports: IncidentReportDto[]) {
  server.use(
    http.get("/api/v1/reports", () =>
      HttpResponse.json({ success: true, data: { reports } })
    )
  )
}

/** Captures the verdict endpoint that was called, if any. */
function stubVerdicts(calls: string[]) {
  server.use(
    http.post("/api/v1/reports/:reportId/:verdict", ({ params }) => {
      calls.push(`${String(params.reportId)}:${String(params.verdict)}`)
      return HttpResponse.json({
        success: true,
        data: { report: reportFixture({ status: "REJECTED" }) },
      })
    })
  )
}

async function renderPage(role: "ADMIN" | "SECURITY_STAFF") {
  signIn(role)
  const user = userEvent.setup()
  renderWithProviders(<ReportsPage />, { route: "/reports" })
  return user
}

describe("reports page · review queue", () => {
  it("offers approve and reject to an administrator on a pending report", async () => {
    stubList([reportFixture()])
    await renderPage("ADMIN")

    const card = await screen.findByTestId("report-report-pending")
    expect(
      within(card).getByRole("button", { name: /approve/i })
    ).toBeInTheDocument()
    expect(
      within(card).getByRole("button", { name: /^reject$/i })
    ).toBeInTheDocument()
  })

  it("offers no verdict to security staff", async () => {
    stubList([reportFixture()])
    await renderPage("SECURITY_STAFF")

    const card = await screen.findByTestId("report-report-pending")
    expect(within(card).queryByRole("button", { name: /approve/i })).toBeNull()
    expect(within(card).queryByRole("button", { name: /reject/i })).toBeNull()
  })

  it("offers no verdict once a report has been reviewed", async () => {
    stubList([APPROVED])
    await renderPage("ADMIN")

    const card = await screen.findByTestId("report-report-approved")
    expect(within(card).getByText(/approved/i)).toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: /approve/i })).toBeNull()
  })

  it("approves on a single click", async () => {
    stubList([reportFixture()])
    const calls: string[] = []
    stubVerdicts(calls)
    const user = await renderPage("ADMIN")

    const card = await screen.findByTestId("report-report-pending")
    await user.click(within(card).getByRole("button", { name: /approve/i }))

    await waitFor(() => expect(calls).toEqual(["report-pending:confirm"]))
  })

  // Rejection is irreversible and there is no un-reject endpoint, so the first
  // click must only arm the action.
  it("does not reject until the second, explicit confirmation", async () => {
    stubList([reportFixture()])
    const calls: string[] = []
    stubVerdicts(calls)
    const user = await renderPage("ADMIN")

    await user.click(await screen.findByRole("button", { name: /^reject$/i }))
    expect(calls).toEqual([])
    expect(screen.getByText(/reject this report\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /confirm reject/i }))
    await waitFor(() => expect(calls).toEqual(["report-pending:reject"]))
  })

  it("abandons an armed rejection on cancel", async () => {
    stubList([reportFixture()])
    const calls: string[] = []
    stubVerdicts(calls)
    const user = await renderPage("ADMIN")

    await user.click(await screen.findByRole("button", { name: /^reject$/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(calls).toEqual([])
    expect(
      screen.getByRole("button", { name: /^reject$/i })
    ).toBeInTheDocument()
  })

  it("filters the list by status and puts the filter in the URL", async () => {
    stubList([reportFixture(), APPROVED])
    const user = await renderPage("ADMIN")

    expect(
      await screen.findByTestId("report-report-pending")
    ).toBeInTheDocument()
    expect(screen.getByTestId("report-report-approved")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Pending (1)" }))

    expect(screen.getByTestId("report-report-pending")).toBeInTheDocument()
    expect(screen.queryByTestId("report-report-approved")).toBeNull()
  })

  it("says the queue is empty rather than showing a blank panel", async () => {
    stubList([])
    await renderPage("ADMIN")

    expect(
      await screen.findByText(/no reports submitted yet/i)
    ).toBeInTheDocument()
  })

  it("surfaces the backend's message when the list cannot be loaded", async () => {
    server.use(
      http.get("/api/v1/reports", () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Database unavailable." },
          },
          { status: 500 }
        )
      )
    )
    await renderPage("ADMIN")

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /database unavailable/i
    )
  })
})
