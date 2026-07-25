import type { AiProviderName } from "../config/ai.config.js"

/**
 * The narrow surface the rest of the backend is allowed to see.
 *
 * Nothing outside `src/ai/` knows which vendor answered, what a chat message
 * looks like, or that HTTP was involved — a caller asks for text and gets text
 * plus a provenance label it can persist.
 */

export type ChatRequest = {
  /** Instructions. Never contains untrusted user input. */
  system: string
  /** The payload. Treated by the prompt as data, never as instructions. */
  user: string
  /** Ask the provider to constrain its output to a single JSON object. */
  json?: boolean
  /** Cancels the in-flight request; composed with the configured timeout. */
  signal?: AbortSignal
}

export type ChatResult = {
  provider: AiProviderName
  model: string
  text: string
}

export type ChatProvider = {
  readonly name: AiProviderName
  readonly model: string
  complete(request: ChatRequest): Promise<ChatResult>
}

/** Why an attempt failed. Every kind is a reason to try the next provider. */
export type AiFailureKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "server"
  | "request"
  | "response"

/**
 * A provider attempt that did not produce usable text.
 *
 * This never escapes to the caller of the extraction: the chain catches it,
 * moves to the next provider, and ultimately falls back to the deterministic
 * extractor. It exists so the log line says *why* a provider was skipped.
 */
export class AiProviderError extends Error {
  readonly provider: string
  readonly kind: AiFailureKind
  readonly status?: number

  constructor(
    provider: string,
    kind: AiFailureKind,
    message: string,
    options?: { status?: number; cause?: unknown }
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause }
    )
    this.name = "AiProviderError"
    this.provider = provider
    this.kind = kind
    this.status = options?.status
  }
}

/** Injectable `fetch`, so unit tests never touch the network. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>
