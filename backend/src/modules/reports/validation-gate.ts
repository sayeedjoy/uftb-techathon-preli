import {
  extractionResultSchema,
  type ExtractionResult,
} from "@scsrg/shared"

import { ValidationError } from "../../shared/errors.js"

/**
 * The validation gate every extraction must pass — deterministic or LLM.
 *
 * Three things happen here and they are not negotiable:
 *   1. the shape is re-parsed with Zod, so a provider cannot invent fields;
 *   2. a zone code that does not exist is discarded rather than trusted; and
 *   3. severity is clamped into 1–5 regardless of what was returned.
 *
 * A report that clears this gate is still only a `PENDING` record. It cannot
 * open an incident, set a zone state, or trigger an actuator — only a human
 * confirmation gives it any influence at all, and even then it is bounded.
 */
export function applyValidationGate(
  candidate: unknown,
  knownZoneCodes: Set<string>
): ExtractionResult {
  const parsed = extractionResultSchema.safeParse(candidate)

  if (!parsed.success) {
    throw new ValidationError(
      "The extracted report failed validation and was discarded.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    )
  }

  const result = parsed.data

  const zoneCode =
    result.zoneCode && knownZoneCodes.has(result.zoneCode)
      ? result.zoneCode
      : null

  return {
    ...result,
    zoneCode,
    estimatedSeverity: Math.max(1, Math.min(5, Math.round(result.estimatedSeverity))),
    confidence: Math.max(0, Math.min(1, result.confidence)),
  }
}
