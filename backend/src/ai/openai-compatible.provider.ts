import { z } from "zod"

import type { AiProviderConfig } from "../config/ai.config.js"
import {
  AiProviderError,
  type ChatProvider,
  type ChatRequest,
  type ChatResult,
  type FetchLike,
} from "./types.js"

/**
 * One client for every OpenAI-chat-completions-compatible vendor.
 *
 * OpenRouter and Groq differ only in base URL, key, model and a couple of
 * attribution headers, so there is no reason for two clients — and one client
 * means the fallback path is exercised by the same code as the primary.
 *
 * The response is parsed with Zod rather than trusted: a provider that returns
 * a differently-shaped body is a failed attempt, not a crash.
 */

const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }).optional(),
        finish_reason: z.string().nullish(),
      })
    )
    .min(1),
})

function classify(status: number): AiProviderError["kind"] {
  if (status === 401 || status === 403) return "auth"
  if (status === 429) return "rate_limit"
  if (status >= 500) return "server"
  return "request"
}

/** Trims a provider error body to something safe and useful in a log line. */
function summarise(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 300)
}

export type ProviderDeps = {
  fetch?: FetchLike
  timeoutMs: number
  maxOutputTokens: number
  temperature: number
}

export function createOpenAiCompatibleProvider(
  config: AiProviderConfig,
  deps: ProviderDeps
): ChatProvider {
  const doFetch: FetchLike =
    deps.fetch ?? ((input, init) => globalThis.fetch(input, init))

  return {
    name: config.name,
    model: config.model,

    async complete(request: ChatRequest): Promise<ChatResult> {
      // A hung provider must not hold the request open: the timeout is what
      // makes "fall back to the next provider" bounded rather than theoretical.
      const timeout = AbortSignal.timeout(deps.timeoutMs)
      const signal = request.signal
        ? AbortSignal.any([request.signal, timeout])
        : timeout

      let response: Response
      try {
        response = await doFetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: deps.temperature,
            max_tokens: deps.maxOutputTokens,
            ...(request.json
              ? { response_format: { type: "json_object" } }
              : {}),
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
        })
      } catch (error) {
        const aborted =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")

        throw new AiProviderError(
          config.name,
          aborted ? "timeout" : "network",
          aborted
            ? `${config.name} did not answer within ${deps.timeoutMs}ms`
            : `${config.name} was unreachable`,
          { cause: error }
        )
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new AiProviderError(
          config.name,
          classify(response.status),
          `${config.name} returned ${response.status}: ${summarise(body)}`,
          { status: response.status }
        )
      }

      const payload: unknown = await response.json().catch(() => null)
      const parsed = chatCompletionSchema.safeParse(payload)
      if (!parsed.success) {
        throw new AiProviderError(
          config.name,
          "response",
          `${config.name} returned an unrecognised completion body`
        )
      }

      const text = parsed.data.choices[0]?.message?.content?.trim() ?? ""
      if (!text) {
        throw new AiProviderError(
          config.name,
          "response",
          `${config.name} returned an empty completion`
        )
      }

      return { provider: config.name, model: config.model, text }
    },
  }
}
