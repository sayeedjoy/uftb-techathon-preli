import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectTypeScriptFiles(full))
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full)
    }
  }
  return files
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8")
  const matches = source.matchAll(/from\s+["']([^"']+)["']/g)
  return [...matches].map((match) => match[1] ?? "")
}

/**
 * The safety boundary for bonus 2, enforced mechanically.
 *
 * A predicted probability must never be able to reach a relay or open an
 * incident. Rather than trusting a comment, this test scans the import graph:
 * adding a forbidden import to `modules/prediction` fails the build.
 */
describe("prediction module boundaries", () => {
  const FORBIDDEN = [
    "actuation",
    "incidents",
    "acknowledgments",
    "zone-state",
    "overrides",
  ]

  it("imports nothing from actuation, incidents or zone state", () => {
    const files = collectTypeScriptFiles(path.join(SRC_ROOT, "modules/prediction"))
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        if (FORBIDDEN.some((forbidden) => specifier.includes(forbidden))) {
          violations.push(`${path.relative(SRC_ROOT, file)} → ${specifier}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it("imports no Prisma client, so it cannot write anything at all", () => {
    const files = collectTypeScriptFiles(path.join(SRC_ROOT, "modules/prediction"))

    const violations = files.filter((file) =>
      importsOf(file).some(
        (specifier) =>
          specifier === "@prisma/client" || specifier.includes("database/prisma")
      )
    )

    expect(violations.map((file) => path.relative(SRC_ROOT, file))).toEqual([])
  })

  it("keeps the trend module out of every hazard code path", () => {
    // Bonus 1 is advisory too: nothing that decides state may consult it.
    const hazardDirectories = [
      "modules/risk-engine",
      "modules/incidents",
      "modules/actuation",
      "modules/priority-engine",
      "modules/zones",
    ]

    const violations: string[] = []
    for (const directory of hazardDirectories) {
      for (const file of collectTypeScriptFiles(path.join(SRC_ROOT, directory))) {
        for (const specifier of importsOf(file)) {
          if (specifier.includes("trend") || specifier.includes("prediction")) {
            violations.push(`${path.relative(SRC_ROOT, file)} → ${specifier}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })
})
