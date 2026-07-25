import type { Request, Response } from "express"
import { loginSchema } from "@scsrg/shared"

import { UnauthenticatedError } from "../../shared/errors.js"
import { ok } from "../../shared/response.js"
import { getCurrentUser, login } from "./auth.service.js"

/** Controllers parse, delegate and shape. No business rule lives here. */
export async function loginController(
  req: Request,
  res: Response
): Promise<void> {
  const credentials = loginSchema.parse(req.body)
  const result = await login(credentials)
  ok(res, result)
}

export async function meController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) throw new UnauthenticatedError()
  const user = await getCurrentUser(req.user.id)
  ok(res, { user })
}
