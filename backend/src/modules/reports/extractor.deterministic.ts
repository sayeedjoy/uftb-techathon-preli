import {
  HAZARD_TYPE,
  type ExtractionResult,
  type HazardType,
} from "@scsrg/shared"

/**
 * Deterministic natural-language extractor.
 *
 * This is the **default** path (`AI_PROVIDER=none`): no paid service, no
 * network, no non-determinism. An LLM provider is opt-in and its output passes
 * through the identical validation gate, so the safety properties do not depend
 * on which extractor ran.
 */

const HAZARD_LEXICON: Array<{ hazard: HazardType; terms: string[] }> = [
  {
    hazard: HAZARD_TYPE.FIRE,
    terms: [
      "fire",
      "flame",
      "flames",
      "smoke",
      "burning",
      "burnt",
      "scorch",
      "sparks",
      "smell of burning",
    ],
  },
  {
    hazard: HAZARD_TYPE.GAS,
    terms: [
      "gas",
      "fume",
      "fumes",
      "vapour",
      "vapor",
      "solder",
      "off-gas",
      "offgassing",
      "chemical smell",
      "lpg",
      "propane",
    ],
  },
  {
    hazard: HAZARD_TYPE.WATER,
    terms: [
      "water",
      "leak",
      "leaking",
      "flood",
      "flooding",
      "damp",
      "condensate",
      "drip",
      "dripping",
      "puddle",
    ],
  },
  {
    hazard: HAZARD_TYPE.OCCUPANCY,
    terms: ["crowd", "people trapped", "someone inside", "students inside"],
  },
]

/** Words that raise the estimated severity. */
const SEVERITY_TERMS: Array<{ terms: string[]; severity: number }> = [
  {
    terms: ["trapped", "explosion", "collapse", "casualty", "injured"],
    severity: 5,
  },
  {
    terms: ["heavy", "thick", "spreading", "large", "everywhere", "strong"],
    severity: 4,
  },
  { terms: ["noticeable", "clear", "definite", "steady"], severity: 3 },
  { terms: ["slight", "faint", "small", "minor", "little"], severity: 2 },
]

/** Hedging language reduces confidence — it should not reduce severity. */
const HEDGE_TERMS = [
  "not sure",
  "unsure",
  "maybe",
  "might",
  "possibly",
  "i think",
  "seems",
  "could be",
  "hard to tell",
  "not certain",
]

export type ZoneAlias = {
  code: string
  name: string
  aliases: string[]
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

function matchZone(text: string, zones: ZoneAlias[]): string | null {
  const haystack = normalise(text)

  // Longest candidate first so "robotics lab" beats a bare "lab".
  const candidates = zones
    .flatMap((zone) =>
      [zone.code, zone.name, ...zone.aliases].map((candidate) => ({
        code: zone.code,
        needle: normalise(candidate).replace(/-/g, " "),
      }))
    )
    .filter((candidate) => candidate.needle.length >= 3)
    .sort((a, b) => b.needle.length - a.needle.length)

  for (const candidate of candidates) {
    if (haystack.includes(candidate.needle)) return candidate.code
  }
  return null
}

function matchHazard(text: string): HazardType | null {
  const haystack = normalise(text)
  let best: { hazard: HazardType; score: number } | null = null

  for (const entry of HAZARD_LEXICON) {
    const score = entry.terms.filter((term) => haystack.includes(term)).length
    if (score > 0 && (!best || score > best.score)) {
      best = { hazard: entry.hazard, score }
    }
  }

  return best?.hazard ?? null
}

function estimateSeverity(text: string): number {
  const haystack = normalise(text)
  for (const entry of SEVERITY_TERMS) {
    if (entry.terms.some((term) => haystack.includes(term))) {
      return entry.severity
    }
  }
  return 3
}

/** Exported so the LLM path phrases uncertainty from the same signal. */
export function countHedges(text: string): number {
  const haystack = normalise(text)
  return HEDGE_TERMS.filter((term) => haystack.includes(term)).length
}

export function extractDeterministic(
  text: string,
  zones: ZoneAlias[]
): ExtractionResult {
  const zoneCode = matchZone(text, zones)
  const hazardType = matchHazard(text)
  const severity = estimateSeverity(text)
  const hedges = countHedges(text)

  // Confidence starts from what we actually identified, then hedging discounts it.
  let confidence = 0.2
  if (zoneCode) confidence += 0.35
  if (hazardType) confidence += 0.35
  confidence -= hedges * 0.15
  confidence = Math.max(0.05, Math.min(1, Math.round(confidence * 100) / 100))

  const zoneName = zones.find((zone) => zone.code === zoneCode)?.name

  const confirmationMessage = buildConfirmation({
    zoneName: zoneName ?? null,
    // Lexicon matching either finds a monitored zone or it does not; it has no
    // way to tell an unrecognised place name from ordinary prose.
    unmatchedZoneLabel: null,
    hazardType,
    severity,
    hedged: hedges > 0,
  })

  return {
    zoneCode,
    hazardType,
    estimatedSeverity: severity,
    confidence,
    confirmationMessage,
    unmatchedZoneLabel: null,
  }
}

/**
 * Builds the message shown back to the reporter.
 *
 * Exported because the LLM extractor reuses it verbatim. A provider is never
 * allowed to author this string: it is the sentence that tells a person what
 * their report did and did not do, and a model that wrote "responders have been
 * dispatched" would be lying on the system's behalf.
 */
export function buildConfirmation(input: {
  zoneName: string | null
  /** Set only when the reporter named a place the system does not monitor. */
  unmatchedZoneLabel: string | null
  hazardType: HazardType | null
  severity: number
  hedged: boolean
}): string {
  const where = input.zoneName
    ? `in the ${input.zoneName}`
    : "at an unidentified zone"
  const what = input.hazardType
    ? `a ${input.hazardType.toLowerCase()} hazard`
    : "an unclassified hazard"

  // Naming the place the reporter used is the difference between a reply they
  // can act on ("I typed the wrong building") and one they cannot.
  const unmatched =
    !input.zoneName && input.unmatchedZoneLabel
      ? `“${input.unmatchedZoneLabel}” is not a monitored zone, so this report is filed without one. `
      : ""

  const hedge = input.hedged
    ? " Your report was recorded as uncertain, which lowers its confidence."
    : ""

  return `${unmatched}Recorded ${what} ${where} at estimated severity ${input.severity}/5. A supervisor must confirm this report before it can influence response priority; it cannot open an incident or trigger any actuator on its own.${hedge}`
}
