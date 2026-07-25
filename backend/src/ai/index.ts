import { aiConfig, type AiConfig } from "../config/ai.config.js"
import { logger } from "../config/logger.js"
import { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"
import type { ChatProvider } from "./types.js"

export { runChatChain } from "./provider-chain.js"
export type { ChainAttempt, ChainOutcome } from "./provider-chain.js"
export { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"
export * from "./types.js"

/**
 * The configured provider chain, built once.
 *
 * Empty when `AI_PROVIDER=none` or no key is present — which is the default and
 * a fully supported way to run the system, not a degraded mode.
 */
export function buildProviderChain(
  config: AiConfig = aiConfig
): ChatProvider[] {
  return config.chain.map((provider) =>
    createOpenAiCompatibleProvider(provider, {
      timeoutMs: config.requestTimeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
    })
  )
}

let cached: ChatProvider[] | null = null

export function aiProviders(): ChatProvider[] {
  cached ??= buildProviderChain()
  return cached
}

/** One line at boot so the operator can see which path a report will take. */
export function logAiProviderChain(): void {
  const chain = aiProviders()

  if (chain.length === 0) {
    logger.info(
      "AI extraction disabled — natural-language reports use the deterministic extractor."
    )
    return
  }

  logger.info(
    { chain: chain.map((provider) => `${provider.name}:${provider.model}`) },
    "AI extraction enabled (deterministic extractor remains the final fallback)."
  )
}
