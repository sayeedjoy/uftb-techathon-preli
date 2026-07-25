/**
 * Headless scenario runner.
 *
 *   pnpm sim:scenario -- --id 5
 *   pnpm sim:scenario -- --all --fast
 *
 * Runs the *same* declarative scenario definitions the UI button uses, against
 * a running backend, and exits non-zero if any assertion fails — so a scenario
 * is a test, not a demo script that happens to look right.
 */
import { env } from "../src/config/env.js"
import { DEV_USERS } from "../prisma/seeds/users.seed.js"
import { SCENARIOS } from "../src/modules/simulator/scenarios/scenarios.js"

type Args = { ids: number[]; fast: boolean }

function parseArgs(argv: string[]): Args {
  const ids: number[] = []
  let fast = false
  let all = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--id" || arg === "-i") {
      const value = Number(argv[i + 1])
      if (Number.isInteger(value)) ids.push(value)
      i += 1
    } else if (arg === "--all") {
      all = true
    } else if (arg === "--fast") {
      fast = true
    }
  }

  if (all || ids.length === 0) {
    return { ids: SCENARIOS.map((scenario) => scenario.id), fast }
  }
  return { ids, fast }
}

async function login(): Promise<string> {
  const admin = DEV_USERS.find((user) => user.role === "ADMIN")
  if (!admin) throw new Error("No seeded admin account is defined.")

  const response = await fetch(`${env.SIM_INGESTION_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  })

  if (!response.ok) {
    throw new Error(
      `Could not sign in as ${admin.email} (HTTP ${response.status}). Is the backend running and seeded?`
    )
  }

  const body = (await response.json()) as { data: { token: string } }
  return body.data.token
}

async function main(): Promise<void> {
  const { ids, fast } = parseArgs(process.argv.slice(2))
  const token = await login()

  let failures = 0

  for (const id of ids) {
    const scenario = SCENARIOS.find((entry) => entry.id === id)
    if (!scenario) {
      console.error(`✗ No scenario with id ${id}`)
      failures += 1
      continue
    }

    console.log(`\n▶ Scenario ${scenario.id}: ${scenario.name}`)
    console.log(`  ${scenario.description}`)

    const response = await fetch(
      `${env.SIM_INGESTION_BASE_URL}/simulator/scenarios/${id}/run`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fast }),
      }
    )

    if (!response.ok) {
      console.error(`  ✗ Run failed with HTTP ${response.status}`)
      failures += 1
      continue
    }

    const body = (await response.json()) as {
      data: {
        result: {
          passed: boolean
          assertions: Array<{
            description: string
            passed: boolean
            detail: string
          }>
        }
      }
    }

    for (const assertion of body.data.result.assertions) {
      console.log(
        `  ${assertion.passed ? "✓" : "✗"} ${assertion.description}\n      ${assertion.detail}`
      )
    }

    if (!body.data.result.passed) failures += 1
  }

  console.log(
    `\n${failures === 0 ? "✓" : "✗"} ${ids.length - failures}/${ids.length} scenarios passed`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error("Scenario runner failed:", error)
  process.exit(1)
})
