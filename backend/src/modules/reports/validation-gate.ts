import { extractionResultSchema, type ExtractionResult } from "@scsrg/shared"

import { ValidationError } from "../../shared/errors.js"

/**
 * Reduces a model-supplied place name to something that can only ever read as
 * a place name.
 *
 * This string is echoed back to the reporter, so it is the one fragment of
 * provider output that reaches a human eye. Stripping it to letters, digits,
 * spaces and hyphens means the worst a provider can do is name a plausible
 * room — not smuggle a sentence, a URL or markup into the reply.
 *
 * `\p{M}` is not optional padding. Bengali, Devanagari, Arabic and decomposed
 * Latin all carry combining marks, and dropping them does not transliterate a
 * name — it shreds it ("ক্যান্টিন" → "ক য ন ট ন"). A campus that reports in
 * Bangla must get its own place names back unmangled.
 */
export function sanitiseZoneLabel(
  value: string | null | undefined
): string | null {
  if (!value) return null

  const cleaned = value
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim()

  return cleaned.length > 0 ? cleaned : null
}

/**
 * The validation gate every extraction must pass — deterministic or LLM.
 *
 * Four things happen here and they are not negotiable:
 *   1. the shape is re-parsed with Zod, so a provider cannot invent fields;
 *   2. a zone code that does not exist is discarded rather than trusted;
 *   3. severity is clamped into 1–5 regardless of what was returned; and
 *   4. the echoed place name is re-sanitised, and dropped entirely once a real
 *      zone matched — "not a monitored zone" must never appear beside one.
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
    estimatedSeverity: Math.max(
      1,
      Math.min(5, Math.round(result.estimatedSeverity))
    ),
    confidence: Math.max(0, Math.min(1, result.confidence)),
    unmatchedZoneLabel: zoneCode
      ? null
      : sanitiseZoneLabel(result.unmatchedZoneLabel),
  }
}
