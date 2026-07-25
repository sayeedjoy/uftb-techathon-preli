import { logger } from "../config/logger.js"
import {
  AiProviderError,
  type ChatProvider,
  type ChatRequest,
} from "./types.js"

/**
 * Ordered failover across providers.
 *
 * There is deliberately **no retry inside a provider**. A second attempt
 * against a vendor that just rate-limited or timed out costs the same wall
 * clock as the first attempt against a healthy one, and this call sits in the
 * request path of a person reporting a hazard. The chain *is* the resilience:
 * primary → fallback → (at the call site) the deterministic extractor.
 *
 * `parse` runs inside the loop on purpose. An answer that is well-formed HTTP
 * but unusable — malformed JSON, a hallucinated field, a value the validation
 * gate rejects — must cost the provider its turn exactly like a 500 does.
 */

export type ChainAttempt = {
  provider: string
  model: string
  kind: string
  message: string
}

export type ChainOutcome<T> =
  | {
      ok: true
      value: T
      provider: string
      model: string
      attempts: ChainAttempt[]
    }
  | { ok: false; attempts: ChainAttempt[] }

function describe(provider: ChatProvider, error: unknown): ChainAttempt {
  if (error instanceof AiProviderError) {
    return {
      provider: provider.name,
      model: provider.model,
      kind: error.kind,
      message: error.message,
    }
  }

  return {
    provider: provider.name,
    model: provider.model,
    kind: "response",
    message: error instanceof Error ? error.message : String(error),
  }
}

export async function runChatChain<T>(
  providers: readonly ChatProvider[],
  request: ChatRequest,
  parse: (text: string) => T
): Promise<ChainOutcome<T>> {
  const attempts: ChainAttempt[] = []

  for (const provider of providers) {
    try {
      const completion = await provider.complete(request)
      return {
        ok: true,
        value: parse(completion.text),
        provider: completion.provider,
        model: completion.model,
        attempts,
      }
    } catch (error) {
      const attempt = describe(provider, error)
      attempts.push(attempt)

      // A failing provider is an expected operating condition, not an incident:
      // warn, name the reason, and move on. Never log the request body — it is
      // a citizen's free-text report.
      logger.warn(
        {
          provider: attempt.provider,
          model: attempt.model,
          kind: attempt.kind,
        },
        `AI provider unavailable, falling back: ${attempt.message}`
      )
    }
  }

  return { ok: false, attempts }
}
