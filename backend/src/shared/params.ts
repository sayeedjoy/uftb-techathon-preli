import type { Request } from "express"

import { NotFoundError } from "./errors.js"

/**
 * Express 5 types a route param as `string | string[]` (a repeated segment is
 * legal). Every read goes through here so a caller can never accidentally treat
 * an array as an id.
 */
export function pathParam(req: Request, name: string): string | undefined {
  const value = req.params[name]
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

export function requiredPathParam(
  req: Request,
  name: string,
  message = `No ${name} was specified.`
): string {
  const value = pathParam(req, name)
  if (!value) throw new NotFoundError(message)
  return value
}

/** Same narrowing for a single-valued query string. */
export function queryParam(req: Request, name: string): string | undefined {
  const value = req.query[name]
  if (typeof value === "string") return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  return undefined
}
