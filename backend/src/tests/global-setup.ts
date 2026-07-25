import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { config as loadDotenv } from "../config/dotenv.js"

/**
 * Runs once per integration run: points every worker at `scsrg_test` and brings
 * that database up to the current migration set. Tests never touch the
 * development database.
 */
export default function globalSetup(): void {
  loadDotenv()

  const testUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://scsrg:scsrg@localhost:5433/scsrg_test?schema=public"

  process.env.NODE_ENV = "test"
  process.env.TEST_DATABASE_URL = testUrl
  process.env.JWT_SECRET = "test-secret-value-at-least-32-characters-long"
  // bcrypt at cost 12 makes a 10-way concurrency test needlessly slow.
  process.env.BCRYPT_ROUNDS = "4"
  // Warm-up is exercised by dedicated unit tests with a fake clock; leaving it
  // on here would suppress gas in every other test for no benefit.
  process.env.GAS_WARMUP_MS = "0"
  // A 300 ms offline window keeps the one real-timer test fast. The sweep
  // interval is pushed out of reach so tests drive the sweeper explicitly and
  // nothing runs behind their backs.
  process.env.ZONE_OFFLINE_TIMEOUT_MS = "300"
  process.env.ZONE_OFFLINE_SWEEP_MS = "3600000"

  const backendRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  )

  // Invoke Prisma's JS entry point through the current Node binary: spawning
  // `npx.cmd` fails with EINVAL on Windows, and a shell string would need
  // quoting on every platform.
  const require = createRequire(import.meta.url)
  const prismaBin = path.join(
    path.dirname(require.resolve("prisma/package.json")),
    "build",
    "index.js"
  )

  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  })
}
