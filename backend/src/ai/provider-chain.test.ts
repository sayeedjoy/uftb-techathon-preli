import { describe, expect, it, vi } from "vitest"

import type { AiProviderName } from "../config/ai.config.js"
import { runChatChain } from "./provider-chain.js"
import { AiProviderError, type ChatProvider } from "./types.js"

function stubProvider(
  name: AiProviderName,
  behaviour: { text: string } | { error: unknown }
): ChatProvider {
  return {
    name,
    model: `${name}-model`,
    complete: vi.fn(async () => {
      if ("error" in behaviour) throw behaviour.error
      return { provider: name, model: `${name}-model`, text: behaviour.text }
    }),
  }
}

const request = { system: "s", user: "u" }

describe("runChatChain", () => {
  it("returns the first success and never calls the fallback", async () => {
    const primary = stubProvider("openrouter", { text: "primary" })
    const fallback = stubProvider("groq", { text: "fallback" })

    const outcome = await runChatChain(
      [primary, fallback],
      request,
      (text) => text
    )

    expect(outcome).toMatchObject({
      ok: true,
      value: "primary",
      provider: "openrouter",
    })
    expect(fallback.complete).not.toHaveBeenCalled()
  })

  it("falls back to groq when openrouter fails", async () => {
    const primary = stubProvider("openrouter", {
      error: new AiProviderError("openrouter", "rate_limit", "429"),
    })
    const fallback = stubProvider("groq", { text: "fallback" })

    const outcome = await runChatChain(
      [primary, fallback],
      request,
      (text) => text
    )

    expect(outcome).toMatchObject({
      ok: true,
      value: "fallback",
      provider: "groq",
    })
    expect(outcome.attempts).toEqual([
      expect.objectContaining({ provider: "openrouter", kind: "rate_limit" }),
    ])
  })

  it("gives up after every provider fails, reporting each reason", async () => {
    const outcome = await runChatChain(
      [
        stubProvider("openrouter", {
          error: new AiProviderError("openrouter", "timeout", "slow"),
        }),
        stubProvider("groq", {
          error: new AiProviderError("groq", "auth", "bad key"),
        }),
      ],
      request,
      (text) => text
    )

    expect(outcome.ok).toBe(false)
    expect(outcome.attempts.map((attempt) => attempt.kind)).toEqual([
      "timeout",
      "auth",
    ])
  })

  // The point of parsing inside the loop: a well-formed HTTP response carrying
  // an unusable answer must cost that provider its turn, not the whole chain.
  it("moves to the next provider when the parser rejects the answer", async () => {
    const primary = stubProvider("openrouter", { text: "not json" })
    const fallback = stubProvider("groq", { text: "usable" })

    const outcome = await runChatChain([primary, fallback], request, (text) => {
      if (text === "not json") throw new Error("unparseable")
      return text
    })

    expect(outcome).toMatchObject({
      ok: true,
      value: "usable",
      provider: "groq",
    })
    expect(outcome.attempts).toEqual([
      expect.objectContaining({ provider: "openrouter", kind: "response" }),
    ])
  })

  it("is a no-op that reports failure when no provider is configured", async () => {
    const outcome = await runChatChain([], request, (text) => text)
    expect(outcome).toEqual({ ok: false, attempts: [] })
  })

  it("describes a non-AiProviderError throw without losing the message", async () => {
    const outcome = await runChatChain(
      [stubProvider("groq", { error: new Error("boom") })],
      request,
      (text) => text
    )

    expect(outcome.attempts[0]).toMatchObject({
      kind: "response",
      message: "boom",
    })
  })
})
