import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

function parse(contents: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

/**
 * Minimal `.env` loader.
 *
 * A dedicated dependency buys nothing here: the file format is trivial, and
 * keeping it in-repo means the config path has no third-party surface.
 * Existing `process.env` values always win, so CI and Docker override the file.
 */
export function config(fileName = ".env"): void {
  const filePath = path.join(BACKEND_ROOT, fileName)
  if (!existsSync(filePath)) return

  for (const [key, value] of Object.entries(
    parse(readFileSync(filePath, "utf8"))
  )) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

/** Loads `.env` unless the process is already fully configured. */
export function loadEnvFile(): void {
  config()
}
