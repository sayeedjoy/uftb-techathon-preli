import { PrismaClient } from "@prisma/client"

import { DEV_USERS, seedUsers } from "./seeds/users.seed.js"
import { seedZones } from "./seeds/zones.seed.js"
import { seedHistory } from "./seeds/history.seed.js"

const prisma = new PrismaClient()

/**
 * Idempotent seed. Safe to run repeatedly: every write is an upsert keyed on a
 * natural unique column, so `pnpm db:seed` twice in a row succeeds.
 */
async function main(): Promise<void> {
  console.log("\nSeeding SCS-RG development data…\n")

  console.log("Users:")
  await seedUsers(prisma)

  console.log("\nZones, sensors and credentials:")
  const zoneKeys = await seedZones(prisma)

  console.log("\nHistorical readings, incidents and audit trail:")
  await seedHistory(prisma)

  console.log(
    "\n────────────────────────────────────────────────────────────────"
  )
  console.log("  ⚠  DEVELOPMENT-ONLY CREDENTIALS — never use in production")
  console.log(
    "────────────────────────────────────────────────────────────────"
  )
  for (const user of DEV_USERS) {
    console.log(`  ${user.role.padEnd(15)} ${user.email}  /  ${user.password}`)
  }
  console.log(
    "\n  Zone API keys were written to backend/.dev-zone-keys.json and"
  )
  console.log("  backend/.env.simulator (both gitignored). They are shown once:")
  for (const [code, key] of Object.entries(zoneKeys)) {
    console.log(`  ${code.padEnd(15)} ${key}`)
  }
  console.log(
    "────────────────────────────────────────────────────────────────\n"
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error("\nSeed failed:", error)
    await prisma.$disconnect()
    process.exit(1)
  })
