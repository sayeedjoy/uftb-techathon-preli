import type { User } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

/** Data access for authentication. Services never touch Prisma directly. */
export function findUserByEmail(
  email: string,
  db: DbHandle = prisma
): Promise<User | null> {
  return db.user.findUnique({ where: { email: email.toLowerCase() } })
}

export function findUserById(
  id: string,
  db: DbHandle = prisma
): Promise<User | null> {
  return db.user.findUnique({ where: { id } })
}
