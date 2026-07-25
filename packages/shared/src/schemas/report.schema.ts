import { z } from "zod"

import { HAZARD_TYPES } from "../domain/index.js"

/**
 * Bonus 3. Both the deterministic extractor and any optional LLM provider are
 * funnelled through `extractionResultSchema` — the validation gate is identical
 * for every path, so an AI answer can never take a shortcut.
 */
export const naturalLanguageReportSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(10, "Describe what you saw in at least 10 characters")
      .max(1000),
  })
  .strict()
export type NaturalLanguageReportInput = z.infer<
  typeof naturalLanguageReportSchema
>

export const extractionResultSchema = z.object({
  zoneCode: z.string().trim().min(1).nullable(),
  hazardType: z.enum(HAZARD_TYPES).nullable(),
  /** 1..5. Clamped by the gate, never trusted raw from a provider. */
  estimatedSeverity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  confirmationMessage: z.string().trim().min(1).max(400),
})
export type ExtractionResult = z.infer<typeof extractionResultSchema>

export const confirmReportSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export type ConfirmReportInput = z.infer<typeof confirmReportSchema>
