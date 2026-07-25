import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { ZodType } from "zod"

import { ValidationError } from "../shared/errors.js"
import { zodIssuesToDetails } from "./error.middleware.js"

export type ValidationTargets = {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

/**
 * Parses and *replaces* the request parts it validates, so downstream handlers
 * receive coerced, defaulted values rather than raw strings.
 *
 * Express 5 makes `req.query` a getter-only property, so the parsed result is
 * stashed on `req.validatedQuery` instead of being assigned back.
 */
export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (targets.params) {
        req.params = targets.params.parse(req.params) as typeof req.params
      }
      if (targets.query) {
        req.validatedQuery = targets.query.parse(req.query)
      }
      if (targets.body) {
        req.body = targets.body.parse(req.body)
      }
      next()
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) {
        next(
          new ValidationError(
            "The request payload is invalid.",
            zodIssuesToDetails(error as Parameters<typeof zodIssuesToDetails>[0])
          )
        )
        return
      }
      next(error)
    }
  }
}

/** Typed accessor for whatever `validate({ query })` produced. */
export function validatedQuery<T>(req: Request): T {
  return req.validatedQuery as T
}
