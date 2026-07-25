import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/render"
import { RouteErrorBoundary } from "./error-boundary"

function Exploding(): never {
  throw new Error("Cannot read properties of undefined (reading 'contributions')")
}

describe("route error boundary", () => {
  it("renders a recovery screen instead of unmounting the tree", async () => {
    // React logs the caught error; silence it so the run stays readable.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    renderWithProviders(
      <RouteErrorBoundary>
        <Exploding />
      </RouteErrorBoundary>,
      { route: "/zones/does-not-exist", withAuth: false }
    )

    expect(
      await screen.findByText("This page failed to render")
    ).toBeInTheDocument()

    // The message is surfaced rather than swallowed — a blank page tells an
    // operator nothing, and tells a developer less.
    expect(screen.getByText(/reading 'contributions'/)).toBeInTheDocument()

    // Both escape hatches are reachable.
    expect(
      screen.getByRole("button", { name: /Back to the Command Center/ })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()

    consoleError.mockRestore()
  })

  it("does not interfere with a subtree that renders normally", () => {
    renderWithProviders(
      <RouteErrorBoundary>
        <p>Command Center</p>
      </RouteErrorBoundary>,
      { withAuth: false }
    )

    expect(screen.getByText("Command Center")).toBeInTheDocument()
    expect(
      screen.queryByText("This page failed to render")
    ).not.toBeInTheDocument()
  })

  it("offers a route back rather than stranding the operator", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    renderWithProviders(
      <RouteErrorBoundary>
        <Exploding />
      </RouteErrorBoundary>,
      { route: "/zones/does-not-exist", withAuth: false }
    )

    const back = await screen.findByRole("button", {
      name: /Back to the Command Center/,
    })
    await userEvent.click(back)

    // Navigation happened; the boundary no longer holds the screen hostage
    // once the route key changes.
    expect(back).not.toBeInTheDocument()

    consoleError.mockRestore()
  })
})
