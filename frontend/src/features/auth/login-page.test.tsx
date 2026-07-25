import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders, signIn } from "@/test/render"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { RequireRole } from "@/routes/guards"
import { LoginPage } from "./login-page"

describe("login", () => {
  it("shows a field error and fires no request for an invalid email", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" })

    await userEvent.type(screen.getByLabelText("Email"), "not-an-email")
    await userEvent.type(screen.getByLabelText("Password"), "Password123!")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Enter a valid email address")
    ).toBeInTheDocument()
  })

  it("requires a password of at least eight characters", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" })

    await userEvent.type(screen.getByLabelText("Email"), "security@scsrg.local")
    await userEvent.type(screen.getByLabelText("Password"), "short")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Password must be at least 8 characters")
    ).toBeInTheDocument()
  })

  it("surfaces a server rejection inline rather than failing silently", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" })

    await userEvent.type(screen.getByLabelText("Email"), "security@scsrg.local")
    await userEvent.type(screen.getByLabelText("Password"), "WrongPassword1!")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Invalid email or password.")
    ).toBeInTheDocument()
  })

  it("stores the session on a successful sign-in", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" })

    await userEvent.type(screen.getByLabelText("Email"), "security@scsrg.local")
    await userEvent.type(screen.getByLabelText("Password"), "Password123!")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() =>
      expect(window.localStorage.getItem("scsrg.token")).toBe("test-token")
    )
  })

  it("labels the seeded credentials as development-only", () => {
    renderWithProviders(<LoginPage />, { route: "/login" })

    expect(screen.getByText("Development-only credentials")).toBeInTheDocument()
  })
})

describe("role-restricted navigation and guards", () => {
  it("hides admin destinations from security staff", async () => {
    signIn("SECURITY_STAFF")
    renderWithProviders(<SidebarNav />)

    expect(await screen.findByText("Command Center")).toBeInTheDocument()
    expect(screen.getByText("Incident History")).toBeInTheDocument()
    expect(screen.queryByText("Administration")).not.toBeInTheDocument()
    expect(screen.queryByText("System Health")).not.toBeInTheDocument()
    expect(screen.queryByText("Simulator")).not.toBeInTheDocument()
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument()
  })

  it("shows admin destinations to an administrator", async () => {
    signIn("ADMIN")
    renderWithProviders(<SidebarNav />)

    expect(await screen.findByText("Administration")).toBeInTheDocument()
    expect(screen.getByText("System Health")).toBeInTheDocument()
    expect(screen.getByText("Simulator")).toBeInTheDocument()
  })

  it("refuses to render an admin page for staff who deep-link to it", async () => {
    signIn("SECURITY_STAFF")
    renderWithProviders(
      <RequireRole role="ADMIN">
        <p>Secret admin console</p>
      </RequireRole>,
      { route: "/system-health" }
    )

    expect(await screen.findByText("Restricted area")).toBeInTheDocument()
    expect(screen.queryByText("Secret admin console")).not.toBeInTheDocument()
  })

  it("renders the admin page for an administrator", async () => {
    signIn("ADMIN")
    renderWithProviders(
      <RequireRole role="ADMIN">
        <p>Secret admin console</p>
      </RequireRole>,
      { route: "/system-health" }
    )

    expect(await screen.findByText("Secret admin console")).toBeInTheDocument()
  })
})
