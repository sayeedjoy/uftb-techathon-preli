/**
 * Prints the development zone API keys written by `pnpm db:seed`.
 *
 * The keys exist only in gitignored files; the database holds bcrypt hashes.
 * If this reports nothing, re-run the seed — a hash cannot be reversed into a
 * usable credential.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

const keyFile = path.join(BACKEND_ROOT, ".dev-zone-keys.json")

if (!existsSync(keyFile)) {
  console.error(
    "\nNo .dev-zone-keys.json found. Run `pnpm db:seed` to generate development keys.\n"
  )
  process.exit(1)
}

const parsed = JSON.parse(readFileSync(keyFile, "utf8")) as {
  generatedAt: string
  keys: Record<string, string>
}

console.log("\n  ⚠  DEVELOPMENT-ONLY zone API keys")
console.log(`  Generated ${parsed.generatedAt}\n`)
for (const [code, key] of Object.entries(parsed.keys)) {
  console.log(`  ${code.padEnd(16)} ${key}`)
}
console.log("")
