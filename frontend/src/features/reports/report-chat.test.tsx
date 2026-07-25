import { describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { IncidentReportDto } from "@scsrg/shared"

import { renderWithProviders, signIn } from "@/test/render"
import { server } from "@/test/msw/server"
import { ReportChat } from "./report-chat"

/**
 * Bonus 4 — the three demo scenarios, plus the guarantee underneath them.
 *
 * The backend owns extraction and the safety gate; what this file proves is
 * that the chat bar reports the backend's answer faithfully and never invents
 * an outcome of its own.
 */

const SAFETY_SENTENCE =
  "A supervisor must confirm this report before it can influence response priority; it cannot open an incident or trigger any actuator on its own."

function reportFixture(
  overrides: Partial<IncidentReportDto> = {}
): IncidentReportDto {
  return {
    id: "report-1",
    userId: "user-staff",
    userName: "Security Mama",
    rawText: "smell of gas near the IoT Lab bench",
    zoneId: "zone-1",
    zoneCode: "IOT-LAB",
    hazardType: "GAS",
    estimatedSeverity: 3,
    confidence: 0.92,
    confirmationMessage: `Recorded a gas hazard in the IoT Lab at estimated severity 3/5. ${SAFETY_SENTENCE}`,
    status: "PENDING",
    extractorProvider: "openrouter",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    ...overrides,
  }
}

/** Captures the outgoing body so a test can assert what the client sent. */
function stubSubmit(report: IncidentReportDto, sent: { body?: unknown } = {}) {
  server.use(
    http.post("/api/v1/reports/natural-language", async ({ request }) => {
      sent.body = await request.json()
      return HttpResponse.json({ success: true, data: { report } })
    })
  )
  return sent
}

async function openChat() {
  signIn("SECURITY_STAFF")
  renderWithProviders(<ReportChat />)
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: /report what you see/i }))
  return user
}

describe("bonus 4 · floating field-report bar", () => {
  // Demo scenario 1: a valid report is understood and echoed back structured.
  it("renders the extracted zone, hazard, severity and confidence", async () => {
    stubSubmit(reportFixture())
    const user = await openChat()

    await user.type(
      screen.getByLabelText(/describe what you observed/i),
      "smell of gas near the IoT Lab bench"
    )
    await user.click(screen.getByRole("button", { name: /send report/i }))

    expect(await screen.findByText("IOT-LAB")).toBeInTheDocument()
    expect(screen.getByText("gas")).toBeInTheDocument()
    expect(screen.getByText("severity 3/5")).toBeInTheDocument()
    expect(screen.getByText("92% confidence")).toBeInTheDocument()
    expect(
      screen.getByText(/awaiting supervisor confirmation/i)
    ).toBeInTheDocument()
  })

  // Demo scenario 2: "there is a fire in the Canteen" — an unmonitored place.
  it("says which place is not a monitored zone", async () => {
    stubSubmit(
      reportFixture({
        zoneId: null,
        zoneCode: null,
        hazardType: "FIRE",
        confirmationMessage: `“Canteen” is not a monitored zone, so this report is filed without one. Recorded a fire hazard at an unidentified zone at estimated severity 4/5. ${SAFETY_SENTENCE}`,
      })
    )
    const user = await openChat()

    await user.type(
      screen.getByLabelText(/describe what you observed/i),
      "there is a fire in the canteen"
    )
    await user.click(screen.getByRole("button", { name: /send report/i }))

    expect(await screen.findByText(/no monitored zone/i)).toBeInTheDocument()
    expect(
      screen.getByText(/“Canteen” is not a monitored zone/)
    ).toBeInTheDocument()
  })

  // Demo scenario 3: the safety gate, visible in the reply and in the request.
  it("states the report cannot actuate, and sends only the raw text", async () => {
    const sent = stubSubmit(reportFixture())
    const user = await openChat()

    await user.type(
      screen.getByLabelText(/describe what you observed/i),
      "smell of gas near the IoT Lab bench"
    )
    await user.click(screen.getByRole("button", { name: /send report/i }))

    // The reply's own sentence, not the panel's standing footer — the footer is
    // always true, so matching it would prove nothing about the response.
    expect(
      await screen.findByText(
        /cannot open an incident or trigger any actuator on its own/
      )
    ).toBeInTheDocument()

    // A node is never trusted with a computed value, and neither is this client:
    // the payload carries the text and nothing else.
    expect(sent.body).toEqual({ text: "smell of gas near the IoT Lab bench" })
  })

  it("shows the backend's rejection instead of a generic failure", async () => {
    server.use(
      http.post("/api/v1/reports/natural-language", () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                "The extracted report failed validation and was discarded.",
            },
          },
          { status: 400 }
        )
      )
    )
    const user = await openChat()

    await user.type(
      screen.getByLabelText(/describe what you observed/i),
      "the lab is quite cold today"
    )
    await user.click(screen.getByRole("button", { name: /send report/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed validation and was discarded/i
    )
  })

  it("will not send below the backend's minimum length", async () => {
    const user = await openChat()

    await user.type(screen.getByLabelText(/describe what you observed/i), "gas")

    expect(screen.getByRole("button", { name: /send report/i })).toBeDisabled()
    expect(screen.getByText(/7 more characters needed/i)).toBeInTheDocument()
  })

  it("sends on Enter and keeps Shift+Enter for a new line", async () => {
    const sent = stubSubmit(reportFixture())
    const user = await openChat()

    const input = screen.getByLabelText(/describe what you observed/i)
    await user.type(
      input,
      "water pooling under the server rack{Shift>}{Enter}{/Shift}"
    )
    expect(sent.body).toBeUndefined()

    await user.type(input, "{Enter}")
    await waitFor(() => expect(sent.body).toBeDefined())
  })

  it("closes on Escape and returns focus to the launcher", async () => {
    const user = await openChat()

    await user.keyboard("{Escape}")

    const launcher = await screen.findByRole("button", {
      name: /report what you see/i,
    })
    await waitFor(() => expect(launcher).toHaveFocus())
  })
})
