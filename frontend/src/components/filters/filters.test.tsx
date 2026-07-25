import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DateField } from "./date-field"
import { FilterSelect } from "./filter-select"

const OPTIONS = [
  { value: "__any__", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
]

describe("FilterSelect", () => {
  it("shows the label of the current value, not the raw value", () => {
    render(
      <FilterSelect
        id="status"
        label="Status"
        value="RESOLVED"
        onValueChange={vi.fn()}
        options={OPTIONS}
      />
    )

    expect(screen.getByText("Resolved")).toBeInTheDocument()
    expect(screen.queryByText("RESOLVED")).not.toBeInTheDocument()
  })

  it("associates the visible label with the trigger", () => {
    render(
      <FilterSelect
        id="status"
        label="Status"
        value="__any__"
        onValueChange={vi.fn()}
        options={OPTIONS}
      />
    )

    expect(screen.getByLabelText("Status")).toBeInTheDocument()
  })

  it("reports the chosen value when an option is picked", async () => {
    const onValueChange = vi.fn()
    render(
      <FilterSelect
        id="status"
        label="Status"
        value="__any__"
        onValueChange={onValueChange}
        options={OPTIONS}
      />
    )

    await userEvent.click(screen.getByLabelText("Status"))
    await userEvent.click(await screen.findByRole("option", { name: "Open" }))

    expect(onValueChange).toHaveBeenCalledWith("OPEN")
  })
})

describe("DateField", () => {
  it("reads as unset rather than showing a misleading default date", () => {
    render(
      <DateField
        id="from"
        label="From"
        boundary="start"
        value=""
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText("Any date")).toBeInTheDocument()
  })

  it("formats an ISO value as a readable day", () => {
    render(
      <DateField
        id="from"
        label="From"
        boundary="start"
        value={new Date(2026, 2, 3, 12, 0, 0).toISOString()}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText("3 Mar 2026")).toBeInTheDocument()
  })

  it("snaps a 'from' date to the start of the chosen day", async () => {
    const onChange = vi.fn()
    render(
      <DateField
        id="from"
        label="From"
        boundary="start"
        value={new Date(2026, 2, 3, 12, 0, 0).toISOString()}
        onChange={onChange}
      />
    )

    await userEvent.click(screen.getByLabelText("From"))
    // react-day-picker names each day by its full date, which is also the
    // assertion that the calendar opened on the *selected* month rather than
    // today's.
    await userEvent.click(
      await screen.findByRole("button", { name: /March 10th, 2026/ })
    )

    const [iso] = onChange.mock.calls[0] as [string]
    const picked = new Date(iso)
    expect(picked.getDate()).toBe(10)
    expect(picked.getHours()).toBe(0)
    expect(picked.getMinutes()).toBe(0)
  })

  it("snaps a 'to' date to the end of the chosen day so that day is included", async () => {
    const onChange = vi.fn()
    render(
      <DateField
        id="to"
        label="To"
        boundary="end"
        value={new Date(2026, 2, 3, 12, 0, 0).toISOString()}
        onChange={onChange}
      />
    )

    await userEvent.click(screen.getByLabelText("To"))
    // react-day-picker names each day by its full date, which is also the
    // assertion that the calendar opened on the *selected* month rather than
    // today's.
    await userEvent.click(
      await screen.findByRole("button", { name: /March 10th, 2026/ })
    )

    const [iso] = onChange.mock.calls[0] as [string]
    const picked = new Date(iso)
    expect(picked.getDate()).toBe(10)
    expect(picked.getHours()).toBe(23)
    expect(picked.getMinutes()).toBe(59)
  })

  it("clears back to unset", async () => {
    const onChange = vi.fn()
    render(
      <DateField
        id="from"
        label="From"
        boundary="start"
        value={new Date(2026, 2, 3, 12, 0, 0).toISOString()}
        onChange={onChange}
      />
    )

    await userEvent.click(
      screen.getByRole("button", { name: "Clear from date" })
    )

    expect(onChange).toHaveBeenCalledWith("")
  })
})
