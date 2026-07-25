import type { ExtractionResult } from "@scsrg/shared"

import { aiProviders, type ChatProvider } from "../../ai/index.js"
import { logger } from "../../config/logger.js"
import {
  extractDeterministic,
  type ZoneAlias,
} from "./extractor.deterministic.js"
import { extractWithProviders } from "./extractor.llm.js"
import { applyValidationGate } from "./validation-gate.js"

/**
 * Picks the extractor and reports which one ran.
 *
 * Deliberately free of any data access so the choice of extractor can be tested
 * without a database — the service does the reading and the writing.
 */

export type Extraction = {
  result: ExtractionResult
  /** Persisted provenance: `openrouter`, `groq` or `deterministic`. */
  provider: string
  /** The model that answered, for the audit log. Null on the local path. */
  model: string | null
}

/**
 * Runs the configured provider chain, then the deterministic extractor.
 *
 * The deterministic path is not an error handler — it is the guaranteed floor.
 * Every provider being down, rate-limited, unfunded or absent produces exactly
 * the behaviour the system has when no key is configured at all, and the
 * reporter sees no difference beyond how well the text was understood.
 */
export async function extractReport(
  text: string,
  zones: ZoneAlias[],
  providers: readonly ChatProvider[] = aiProviders()
): Promise<Extraction> {
  const knownCodes = new Set(zones.map((zone) => zone.code))
  const gate = (candidate: ExtractionResult) =>
    applyValidationGate(candidate, knownCodes)

  if (providers.length > 0) {
    const outcome = await extractWithProviders(providers, text, zones, gate)
    if (outcome.ok) {
      return {
        result: outcome.value,
        provider: outcome.provider,
        model: outcome.model,
      }
    }

    logger.warn(
      { attempts: outcome.attempts.length },
      "Every AI provider failed; using the deterministic extractor."
    )
  }

  // Needs no key, no network and no account. This is the default path.
  return {
    result: gate(extractDeterministic(text, zones)),
    provider: "deterministic",
    model: null,
  }
}
