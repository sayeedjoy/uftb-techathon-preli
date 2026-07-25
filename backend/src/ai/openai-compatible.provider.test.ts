import { describe, expect, it, vi } from "vitest"

import type { AiProviderConfig } from "../config/ai.config.js"
import { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"
import { AiProviderError, type FetchLike } from "./types.js"

const config: AiProviderConfig = {
  name: "openrouter",
  baseUrl: "https://openrouter.test/api/v1",
  apiKey: "test-key",
  model: "test/model",
  headers: { "X-Title": "SCS-RG" },
}

const deps = { timeoutMs: 50, maxOutputTokens: 200, temperature: 0 }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function completion(content: string): unknown {
  return { choices: [{ message: { content }, finish_reason: "stop" }] }
}

describe("openai-compatible provider", () => {
  it("posts to /chat/completions with the key, model and headers", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse(completion("hi")))

    const result = await createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    }).complete({ system: "sys", user: "usr", json: true })

    expect(result).toEqual({
      provider: "openrouter",
      model: "test/model",
      text: "hi",
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://openrouter.test/api/v1/chat/completions")

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer test-key")
    expect(headers["X-Title"]).toBe("SCS-RG")

    const body = JSON.parse(init.body as string)
    expect(body.model).toBe("test/model")
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(200)
    expect(body.response_format).toEqual({ type: "json_object" })
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ])
  })

  it("omits response_format when JSON mode is not requested", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse(completion("hi")))

    await createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    }).complete({
      system: "sys",
      user: "usr",
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.response_format).toBeUndefined()
  })

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limit"],
    [400, "request"],
    [500, "server"],
    [503, "server"],
  ])("classifies HTTP %i as %s", async (status, kind) => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response("upstream said no", { status }))

    const provider = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    })

    await expect(
      provider.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      name: "AiProviderError",
      provider: "openrouter",
      kind,
      status,
    })
  })

  it("reports a network failure as a network error", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockRejectedValue(new TypeError("fetch failed"))

    const provider = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    })

    await expect(
      provider.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      kind: "network",
    })
  })

  it("reports an aborted request as a timeout", async () => {
    const abortError = new Error("aborted")
    abortError.name = "TimeoutError"
    const fetchMock = vi.fn<FetchLike>().mockRejectedValue(abortError)

    const provider = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    })

    await expect(
      provider.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      kind: "timeout",
    })
  })

  it("passes an abort signal down to fetch", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse(completion("hi")))
    const controller = new AbortController()

    await createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    }).complete({
      system: "s",
      user: "u",
      signal: controller.signal,
    })

    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })

  it("rejects an unrecognised body rather than throwing on undefined", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ nope: true }))

    const provider = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    })

    await expect(
      provider.complete({ system: "s", user: "u" })
    ).rejects.toBeInstanceOf(AiProviderError)
  })

  it("rejects non-JSON and empty completions", async () => {
    const notJson = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: vi
        .fn<FetchLike>()
        .mockResolvedValue(new Response("<html>", { status: 200 })),
    })
    await expect(
      notJson.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      kind: "response",
    })

    const empty = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: vi
        .fn<FetchLike>()
        .mockResolvedValue(jsonResponse(completion("   "))),
    })
    await expect(
      empty.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      kind: "response",
    })
  })

  it("treats a null content field as an empty completion", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: null } }] })
      )

    const provider = createOpenAiCompatibleProvider(config, {
      ...deps,
      fetch: fetchMock,
    })

    await expect(
      provider.complete({ system: "s", user: "u" })
    ).rejects.toMatchObject({
      kind: "response",
    })
  })
})
