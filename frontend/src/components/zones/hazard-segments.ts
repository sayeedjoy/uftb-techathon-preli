import type { RiskContributions } from "@scsrg/shared"

/**
 * The four risk inputs, in the order the fusion formula weights them
 * (40·fire + 25·gas + 20·water + 15·occupancy). Fixed order, never cycled:
 * colour follows the hazard, not its rank in this particular zone.
 *
 * The fills resolve to `--hazard-*`, a categorical palette kept deliberately
 * separate from the status tokens. See the note beside those tokens in
 * `index.css` — the separation is what makes the set pass colour-vision
 * validation in both themes.
 *
 * Lives in its own module rather than beside the components so the component
 * files stay fast-refresh clean.
 */
export const HAZARD_SEGMENTS = [
  { key: "fire", label: "Fire", fill: "bg-hazard-fire" },
  { key: "gas", label: "Gas", fill: "bg-hazard-gas" },
  { key: "water", label: "Water", fill: "bg-hazard-water" },
  { key: "occupancy", label: "Occupancy", fill: "bg-hazard-occupancy" },
] as const satisfies ReadonlyArray<{
  key: keyof RiskContributions
  label: string
  fill: string
}>
