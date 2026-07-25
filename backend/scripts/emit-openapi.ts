/**
 * Emits the OpenAPI document to docs/openapi.json.
 *
 *   pnpm docs:openapi
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { buildOpenApiDocument } from "../src/config/openapi.js"

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

const document = buildOpenApiDocument()
const outputDirectory = path.join(REPO_ROOT, "docs")
const outputPath = path.join(outputDirectory, "openapi.json")

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8")

const paths = Object.keys(document.paths as Record<string, unknown>)
console.log(`\n✓ Wrote docs/openapi.json — ${paths.length} documented paths.\n`)
