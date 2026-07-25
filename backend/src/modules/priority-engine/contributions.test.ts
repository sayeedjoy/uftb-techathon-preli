import { describe, expect, it } from "vitest"

import { asContributions } from "./contributions.js"

/**
 * `Zone.contributions` is a JSON column, so anything can end up in it — an
 * older schema, a hand-edited row, an outright null. A malformed blob must
 * degrade one zone's multi-hazard bonus, never throw inside the priority
 * recalculation and take the whole queue down with it.
 */
describe("asContributions", () => {
  it("reads a well-formed blob", () => {
    expect(
      asContributions({ fire: 40, gas: 17.5, water: 0, occupancy: 15 })
    ).toEqual({ fire: 40, gas: 17.5, water: 0, occupancy: 15 })
  })

  it("fills in missing keys with zero", () => {
    expect(asContributions({ fire: 40 })).toEqual({
      fire: 40,
      gas: 0,
      water: 0,
      occupancy: 0,
    })
  })

  it("ignores keys it does not recognise", () => {
    expect(asContributions({ fire: 40, smoke: 99 })).toEqual({
      fire: 40,
      gas: 0,
      water: 0,
      occupancy: 0,
    })
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not an object"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
  ])("returns zeroes for %s", (_label, value) => {
    expect(asContributions(value)).toEqual({
      fire: 0,
      gas: 0,
      water: 0,
      occupancy: 0,
    })
  })

  it.each([
    ["a string value", { fire: "40" }],
    ["a null value", { fire: null }],
    ["NaN", { fire: Number.NaN }],
    ["Infinity", { fire: Number.POSITIVE_INFINITY }],
  ])("treats %s as zero", (_label, value) => {
    expect(asContributions(value).fire).toBe(0)
  })

  it("returns a fresh object each time, never a shared default", () => {
    const first = asContributions(null)
    first.fire = 99
    expect(asContributions(null).fire).toBe(0)
  })
})
