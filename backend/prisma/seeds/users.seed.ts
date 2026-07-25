import type { PrismaClient } from "@prisma/client"

import { hashPassword } from "../../src/modules/auth/password.util.js"

/**
 * DEVELOPMENT-ONLY credentials.
 *
 * These exist so a reviewer can log in immediately after a clean clone. They
 * are printed by the seed with an explicit warning and are documented as
 * development-only in the README. Never ship them.
 */
export const DEV_USERS = [
  {
    name: "Ava Rahman",
    email: "admin@scsrg.local",
    password: "Admin123!",
    role: "ADMIN" as const,
  },
  {
    name: "Noel Ferreira",
    email: "security@scsrg.local",
    password: "Security123!",
    role: "SECURITY_STAFF" as const,
  },
]

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  for (const user of DEV_USERS) {
    const passwordHash = await hashPassword(user.password)
    await prisma.user.upsert({
      where: { email: user.email },
      // Re-running the seed refreshes the password but never duplicates a row.
      update: { name: user.name, role: user.role, passwordHash, isActive: true },
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        passwordHash,
      },
    })
    console.log(`  • user ${user.email} (${user.role})`)
  }
}
