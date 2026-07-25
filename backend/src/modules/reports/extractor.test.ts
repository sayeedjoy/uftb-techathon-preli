import { HAZARD_TYPE } from "@scsrg/shared"
import { describe, expect, it, vi } from "vitest"

import { AiProviderError, type ChatProvider } from "../../ai/index.js"
import type { ZoneAlias } from "./extractor.deterministic.js"
import { extractReport } from "./extractor.js"

const zones: ZoneAlias[] = [
  { code: "LAB-01", name: "Robotics Lab", aliases: ["lab 01"] },
  { code: "LIB-02", name: "Library Basement", aliases: [] },
]

const TEXT = "thick smoke coming from the robotics lab"

function answering(name: "openrouter" | "groq", text: string): ChatProvider {
  return {
    name,
    model: `${name}-model`,
    complete: vi.fn(async () => ({
      provider: name,
      model: `${name}-model`,
      text,
    })),
  }
}

function failing(name: "openrouter" | "groq"): ChatProvider {
  return {
    name,
    model: `${name}-model`,
    complete: vi.fn(async () => {
      throw new AiProviderError(name, "server", "503")
    }),
  }
}

const goodAnswer = JSON.stringify({
  zoneCode: "LIB-02",
  hazardType: HAZARD_TYPE.WATER,
  estimatedSeverity: 2,
  confidence: 0.9,
})

describe("extractReport", () => {
  it("uses the deterministic extractor when no provider is configured", async () => {
    const extraction = await extractReport(TEXT, zones, [])

    expect(extraction.provider).toBe("deterministic")
    expect(extraction.model).toBeNull()
    expect(extraction.result).toMatchObject({
      zoneCode: "LAB-01",
      hazardType: HAZARD_TYPE.FIRE,
    })
  })

  it("reports the provider and model that answered", async () => {
    const extraction = await extractReport(TEXT, zones, [
      answering("openrouter", goodAnswer),
    ])

    expect(extraction).toMatchObject({
      provider: "openrouter",
      model: "openrouter-model",
    })
    expect(extraction.result.zoneCode).toBe("LIB-02")
  })

  it("falls back to groq when the primary is down", async () => {
    const primary = failing("openrouter")
    const fallback = answering("groq", goodAnswer)

    const extraction = await extractReport(TEXT, zones, [primary, fallback])

    expect(extraction.provider).toBe("groq")
    expect(fallback.complete).toHaveBeenCalledOnce()
  })

  // The floor: every provider failing looks exactly like no key being set.
  it("falls all the way back to deterministic when every provider fails", async () => {
    const extraction = await extractReport(TEXT, zones, [
      failing("openrouter"),
      failing("groq"),
    ])

    expect(extraction.provider).toBe("deterministic")
    expect(extraction.result).toMatchObject({
      zoneCode: "LAB-01",
      hazardType: HAZARD_TYPE.FIRE,
    })
  })

  it("falls back rather than storing an answer the gate rejects", async () => {
    const unusable = answering(
      "openrouter",
      "I'm sorry, I can't help with that."
    )

    const extraction = await extractReport(TEXT, zones, [unusable])

    expect(extraction.provider).toBe("deterministic")
    expect(extraction.result.confirmationMessage).toContain(
      "supervisor must confirm"
    )
  })

  it("never lets a provider decide the confirmation message", async () => {
    const extraction = await extractReport(TEXT, zones, [
      answering(
        "openrouter",
        JSON.stringify({
          zoneCode: "LAB-01",
          hazardType: HAZARD_TYPE.FIRE,
          estimatedSeverity: 5,
          confidence: 1,
          confirmationMessage: "Evacuation ordered. Fire crews en route.",
        })
      ),
    ])

    expect(extraction.result.confirmationMessage).not.toContain("Evacuation")
    expect(extraction.result.confirmationMessage).toContain(
      "cannot open an incident or trigger any actuator"
    )
  })
})
