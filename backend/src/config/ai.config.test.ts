import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `buildAiConfig` reads the frozen `env` object, so each case re-imports the
 * module with a mocked env rather than mutating `process.env` after the fact.
 */
async function withEnv(overrides: Record<string, unknown>) {
  vi.resetModules()
  vi.doMock("./env.js", () => ({
    env: {
      AI_PROVIDER: "none",
      AI_REQUEST_TIMEOUT_MS: 8_000,
      AI_MAX_OUTPUT_TOKENS: 400,
      AI_TEMPERATURE: 0,
      OPENROUTER_MODEL: "or/model",
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
      OPENROUTER_APP_NAME: "SCS-RG",
      GROQ_MODEL: "groq/model",
      GROQ_BASE_URL: "https://api.groq.com/openai/v1",
      ...overrides,
    },
  }))

  const { buildAiConfig } = await import("./ai.config.js")
  return buildAiConfig()
}

afterEach(() => {
  vi.doUnmock("./env.js")
  vi.resetModules()
})

describe("buildAiConfig", () => {
  it("is disabled by default, with no key required", async () => {
    const config = await withEnv({})
    expect(config).toMatchObject({ enabled: false, chain: [] })
  })

  it("stays disabled when keys exist but AI_PROVIDER is none", async () => {
    const config = await withEnv({
      OPENROUTER_API_KEY: "or",
      GROQ_API_KEY: "gq",
    })
    expect(config.enabled).toBe(false)
  })

  it("orders openrouter first and groq as the fallback", async () => {
    const config = await withEnv({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "or",
      GROQ_API_KEY: "gq",
    })

    expect(config.chain.map((provider) => provider.name)).toEqual([
      "openrouter",
      "groq",
    ])
    expect(config.enabled).toBe(true)
  })

  it("honours groq as the primary, with openrouter behind it", async () => {
    const config = await withEnv({
      AI_PROVIDER: "groq",
      OPENROUTER_API_KEY: "or",
      GROQ_API_KEY: "gq",
    })

    expect(config.chain.map((provider) => provider.name)).toEqual([
      "groq",
      "openrouter",
    ])
  })

  it("runs a single-provider chain when only one key is present", async () => {
    const config = await withEnv({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "or",
    })
    expect(config.chain.map((provider) => provider.name)).toEqual([
      "openrouter",
    ])
  })

  it("carries the key, model and attribution headers per provider", async () => {
    const config = await withEnv({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_SITE_URL: "http://localhost:5173",
      GROQ_API_KEY: "gq-key",
    })

    expect(config.chain[0]).toMatchObject({
      name: "openrouter",
      apiKey: "or-key",
      model: "or/model",
      headers: { "HTTP-Referer": "http://localhost:5173", "X-Title": "SCS-RG" },
    })
    expect(config.chain[1]).toMatchObject({
      name: "groq",
      apiKey: "gq-key",
      model: "groq/model",
      headers: {},
    })
  })

  it("omits the referer header when no site URL is set", async () => {
    const config = await withEnv({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "or",
    })
    expect(config.chain[0]?.headers).toEqual({ "X-Title": "SCS-RG" })
  })
})
