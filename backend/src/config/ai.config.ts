import { env } from "./env.js"

/**
 * AI provider configuration.
 *
 * Both supported providers speak the OpenAI chat-completions dialect, so a
 * single client drives them and the only per-provider difference is a base URL,
 * a key, a model and a couple of headers — all of it configuration, never
 * constants, and all of it read from the backend environment. **No key or model
 * name ever reaches the browser.**
 *
 * `AI_PROVIDER` names the *primary*. Any other provider that has a key
 * configured is appended as a fallback, and the deterministic extractor is the
 * last resort in every case — so the feature keeps working with no key at all,
 * with one key, or with both.
 */

export const AI_PROVIDER_NAMES = ["openrouter", "groq"] as const
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number]

export type AiProviderConfig = {
  name: AiProviderName
  baseUrl: string
  apiKey: string
  model: string
  /** Provider-specific headers merged over the common ones. */
  headers: Record<string, string>
}

export type AiConfig = {
  /** True when at least one provider is configured and AI_PROVIDER !== "none". */
  enabled: boolean
  /** Attempted in order; the first success wins. */
  chain: AiProviderConfig[]
  requestTimeoutMs: number
  maxOutputTokens: number
  temperature: number
}

function openRouterConfig(): AiProviderConfig | null {
  if (!env.OPENROUTER_API_KEY) return null

  return {
    name: "openrouter",
    baseUrl: env.OPENROUTER_BASE_URL,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    // Attribution only — OpenRouter reads these for its dashboard and ranking.
    headers: {
      ...(env.OPENROUTER_SITE_URL
        ? { "HTTP-Referer": env.OPENROUTER_SITE_URL }
        : {}),
      "X-Title": env.OPENROUTER_APP_NAME,
    },
  }
}

function groqConfig(): AiProviderConfig | null {
  if (!env.GROQ_API_KEY) return null

  return {
    name: "groq",
    baseUrl: env.GROQ_BASE_URL,
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
    headers: {},
  }
}

export function buildAiConfig(): AiConfig {
  const available = new Map<AiProviderName, AiProviderConfig>()
  for (const candidate of [openRouterConfig(), groqConfig()]) {
    if (candidate) available.set(candidate.name, candidate)
  }

  const primary =
    env.AI_PROVIDER === "none" ? null : available.get(env.AI_PROVIDER)

  // Primary first, then every other configured provider in declaration order.
  const chain =
    env.AI_PROVIDER === "none"
      ? []
      : [
          ...(primary ? [primary] : []),
          ...AI_PROVIDER_NAMES.filter((name) => name !== env.AI_PROVIDER)
            .map((name) => available.get(name))
            .filter((config): config is AiProviderConfig => Boolean(config)),
        ]

  return {
    enabled: chain.length > 0,
    chain,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    temperature: env.AI_TEMPERATURE,
  }
}

export const aiConfig: AiConfig = buildAiConfig()
