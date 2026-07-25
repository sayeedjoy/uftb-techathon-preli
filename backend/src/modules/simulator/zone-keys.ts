import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { logger } from "../../config/logger.js"

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

/**
 * Zone API keys, held **server-side only**.
 *
 * The simulator engine runs in the backend precisely so these never reach a
 * browser (spec D2). Nothing in this module is ever serialised into a response.
 */
let cache: Record<string, string> | null = null

export function loadZoneKeys(refresh = false): Record<string, string> {
  if (cache && !refresh) return cache

  const keys: Record<string, string> = {}

  // 1. The file written by `pnpm db:seed`.
  const keyFile = path.join(BACKEND_ROOT, ".dev-zone-keys.json")
  if (existsSync(keyFile)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(keyFile, "utf8"))
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "keys" in parsed &&
        typeof (parsed as { keys: unknown }).keys === "object"
      ) {
        Object.assign(keys, (parsed as { keys: Record<string, string> }).keys)
      }
    } catch (error) {
      logger.warn({ err: error }, "Could not parse .dev-zone-keys.json")
    }
  }

  // 2. Environment overrides — SIM_ZONE_KEY_IOT_LAB=… for containerised runs.
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("SIM_ZONE_KEY_") || !value) continue
    const code = name
      .slice("SIM_ZONE_KEY_".length)
      .toLowerCase()
      .replace(/_/g, "-")
    keys[code] = value
  }

  cache = keys
  return keys
}

export function zoneKeyFor(code: string): string | null {
  return loadZoneKeys()[code] ?? null
}

/** Registers a key minted at runtime (the load scenario's synthetic zones). */
export function registerZoneKey(code: string, apiKey: string): void {
  cache = { ...loadZoneKeys(), [code]: apiKey }
}
